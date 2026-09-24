import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

const migration=readFileSync(new URL('../supabase/migrations/20260923050000_external_business_identity_enquiries.sql',import.meta.url),'utf8');
const messagingMigration=readFileSync(new URL('../supabase/migrations/20260923090000_external_messaging_safety.sql',import.meta.url),'utf8');
const discovery=readFileSync(new URL('../supabase/functions/external-discovery/index.ts',import.meta.url),'utf8');
const gateway=readFileSync(new URL('../supabase/functions/external-quote-gateway/index.ts',import.meta.url),'utf8');
const dispatcher=readFileSync(new URL('../supabase/functions/external-message-dispatch/index.ts',import.meta.url),'utf8');
const search=readFileSync(new URL('../app/search.tsx',import.meta.url),'utf8');
const externalDirectory=readFileSync(new URL('../app/external-businesses.tsx',import.meta.url),'utf8');

test('external identities hold provider identifiers only, remain distinct and require trusted registration',()=>{
 const table=migration.match(/create table public\.external_business_references \(([\s\S]*?)\n\);/)?.[1]??'';
 assert.match(table,/unique \(provider,provider_identifier\)/);
 assert.doesNotMatch(table,/\b(name|address|rating|review|photo)_?(url)?\s+text/i);
 assert.match(table,/claimed_business_id uuid references public\.businesses/);
 assert.match(migration,/revoke all on function public\.register_external_reference\(text\) from public,anon,authenticated/);
 assert.match(migration,/grant execute on function public\.register_external_reference\(text\) to service_role/);
 assert.match(discovery,/reference\?\.status !== 'UNLINKED'/);
});

test('customer authorisation has ownership, fresh identity, suppression and abuse boundaries',()=>{
 assert.match(migration,/where id=p_request_id and customer_id=auth\.uid\(\) for update/);
 assert.match(migration,/v_ref\.status <> 'UNLINKED' or v_ref\.last_seen_at < now\(\)-interval '15 minutes'/);
 assert.match(migration,/count\(\*\) from public\.external_enquiries where request_id=p_request_id\)>=3/);
 assert.match(migration,/created_at>now\(\)-interval '1 day'\)>=5/);
 assert.match(migration,/created_at>now\(\)-interval '30 days'/);
 assert.match(migration,/unique\(request_id,reference_id\)/);
 assert.match(migration,/request_snapshot jsonb not null/);
 assert.match(externalDirectory,/AUTHORISE THIS ENQUIRY/);
 assert.match(externalDirectory,/p_share_email:shareEmail,p_share_phone:sharePhone/);
 assert.match(externalDirectory,/record_external_business_selection/);
});

test('private tables and gateway do not expose arbitrary customer data',()=>{
 for(const table of ['external_business_references','external_enquiries','external_quote_responses','external_gateway_tokens','external_enquiry_events','external_business_claim_requests']){
  assert.match(migration,new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(migration,new RegExp(`revoke all on public\\.${table} from anon,authenticated`));
 }
 assert.match(migration,/customer_id=auth\.uid\(\) or public\.is_admin\(\)/);
 assert.match(migration,/token_hash bytea not null unique/);
 assert.match(migration,/public\.gen_random_bytes\(32\)/);
 assert.match(migration,/public\.digest\(p_token,'sha256'\)/);
 assert.match(migration,/v_token\.revoked_at is not null or v_token\.used_at is not null or v_token\.expires_at<=now\(\)/);
 assert.match(migration,/where token_hash=public\.digest\(p_token,'sha256'\) for update/);
 assert.match(migration,/grant execute on function public\.read_external_gateway\(text\) to service_role/);
 assert.match(migration,/grant execute on function public\.submit_external_gateway_quote\(text,numeric,text,text,timestamptz\) to service_role/);
 assert.match(gateway,/EXTERNAL_QUOTE_GATEWAY_ENABLED'\) !== 'true'/);
 assert.doesNotMatch(gateway,/from\('quotes'\)|from\('bookings'\)/);
});

test('discovery is authenticated, metered and native search retains failure isolation',()=>{
 assert.match(discovery,/\.from\('external_feature_flags'\)/);
 assert.match(discovery,/\.eq\('name', 'discovery'\)/);
 assert.match(discovery,/userClient\.auth\.getUser\(\)/);
 assert.match(discovery,/consume_external_discovery_quota/);
 assert.match(discovery,/pageSize: 5/);
 assert.match(discovery,/AbortSignal\.timeout\(4500\)/);
 assert.doesNotMatch(search,/functions\.invoke\('external-discovery'/);
 assert.match(search,/external-businesses/);
 assert.match(externalDirectory,/functions\.invoke\('external-discovery'/);
 assert.match(externalDirectory,/search itself never contacts them/i);
 assert.match(migration,/values \('discovery'\),\('enquiries'\),\('gateway'\),\('messaging'\),\('claiming'\)/);
});

test('claiming requires existing verification and independent admin review',()=>{
 assert.match(migration,/public\.is_business_member\(p_business_id\)/);
 assert.match(migration,/verification_status='VERIFIED'/);
 assert.match(migration,/if not public\.is_admin\(\) or p_proof_method not in/);
 assert.match(migration,/status='LINKED',claimed_business_id=v_claim\.business_id/);
 assert.doesNotMatch(discovery,/insert into public\.businesses/);
});

test('revocation and suppression block later access without changing native booking authority',()=>{
 assert.match(migration,/update public\.external_gateway_tokens set revoked_at=now\(\) where enquiry_id=v_id/);
 assert.match(migration,/status='SUPPRESSED',suppressed_at=now\(\)/);
 assert.match(migration,/where reference_id=v_id and status in \('AUTHORISED','READY','SENT','DELIVERED','OPENED'\)/);
 assert.match(migration,/v_token\.used_at is not null/);
 assert.match(migration,/insert into public\.external_quote_responses/);
 assert.doesNotMatch(migration,/insert into public\.(quotes|bookings|payments|service_matches|opportunities)\b/);
});

test('outbound contact is verified, bound, suppressible and service-role queued',()=>{
 for(const table of ['external_business_contacts','external_contact_suppressions','external_message_deliveries']){
  assert.match(messagingMigration,new RegExp(`alter table public\\.${table} enable row level security`));
  assert.match(messagingMigration,new RegExp(`revoke all on public\\.${table} from public,anon,authenticated`));
 }
 assert.match(messagingMigration,/recipient_contact_id uuid references public\.external_business_contacts/);
 assert.match(messagingMigration,/verification_status='VERIFIED'/);
 assert.match(messagingMigration,/RECIPIENT_CONTACT_BOUND/);
 assert.match(messagingMigration,/BUSINESS_OPTOUT/);
 assert.match(messagingMigration,/destination_hash/);
 assert.match(messagingMigration,/Recipient cooldown active/);
 assert.match(messagingMigration,/External messaging disabled/);
 assert.match(messagingMigration,/grant execute on function public\.enqueue_external_enquiry_delivery\(uuid\) to service_role/);
 assert.match(messagingMigration,/revoke execute on function public\.prepare_external_gateway\(uuid,text\) from authenticated/);
});

test('message worker is sandbox-only and contains no production provider transport',()=>{
 assert.match(dispatcher,/EXTERNAL_MESSAGING_ENABLED/);
 assert.match(dispatcher,/EXTERNAL_MESSAGING_TRANSPORT/);
 assert.match(dispatcher,/!== 'sandbox'/);
 assert.match(dispatcher,/EXTERNAL_MESSAGE_WORKER_SECRET/);
 assert.match(dispatcher,/sent:false/);
 assert.doesNotMatch(dispatcher,/sendgrid|twilio|resend|mailgun|postmark|amazon[-_ ]?ses|messagebird|clicksend/i);
 assert.doesNotMatch(dispatcher,/fetch\(['"]https:\/\//);
 assert.match(messagingMigration,/RAW_TOKEN_HANDOFF_NOT_IMPLEMENTED/);
});

test('external messaging never mutates native quote, booking, payment or dispatch authority',()=>{
 assert.doesNotMatch(messagingMigration,/insert into public\.(quotes|bookings|payments|service_matches|opportunities|dispatch_jobs)\b/);
 assert.doesNotMatch(dispatcher,/from\(['"](?:quotes|bookings|payments|service_matches|opportunities|dispatch_jobs)['"]\)/);
});

test('production handoff can only issue a transient bearer value to a trusted worker',()=>{
 assert.match(messagingMigration,/revoke execute on function public\.issue_external_gateway_token\(uuid\) from public,anon,authenticated/);
 assert.match(messagingMigration,/grant execute on function public\.claim_external_delivery_for_send\(\) to service_role/);
 assert.match(messagingMigration,/public\.digest\(v_token,'sha256'\)/);
 assert.doesNotMatch([...messagingMigration.matchAll(/create table public\.\w+ \(([\s\S]*?)\n\);/g)].map(match=>match[1]).join('\n'),/\b(?:raw_token|gateway_token)\s+(?:text|varchar)\b/i);
 assert.match(messagingMigration,/grant execute on function public\.complete_external_delivery\(uuid,boolean,text,text\) to service_role/);
 assert.match(messagingMigration,/public\.external_discovery_daily_quota\.requests<100/);
});

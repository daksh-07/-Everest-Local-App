import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {URL} from 'node:url';

const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=read('supabase/migrations/20260926190000_crm_contact_import.sql');
const client=read('lib/crm.ts');
const parser=read('lib/contact-import.ts');
const screen=read('app/business-customers.tsx');

test('bulk contact import is membership-gated, bounded and duplicate-safe',()=>{
 assert.match(migration,/public\.is_business_member\(p_business_id\)/);
 assert.match(migration,/jsonb_array_length\(p_rows\)>1000/);
 assert.match(migration,/lower\(email\)=v_email/);
 assert.match(migration,/regexp_replace\(coalesce\(phone,''\),'\\\\D','','g'\)/);
 assert.match(migration,/grant execute on function public\.crm_import_contacts/);
});
test('CRM exposes explicit reviewed CSV import rather than hidden contact scraping',()=>{
 assert.match(client,/importCrmContacts/);
 assert.match(parser,/parseContactCsv/);
 assert.match(screen,/HubSpot, GoHighLevel, Google Contacts or your phone/);
 assert.match(screen,/duplicates are safely skipped/);
});

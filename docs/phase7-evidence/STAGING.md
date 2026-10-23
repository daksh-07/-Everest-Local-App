# Isolated staging setup and acceptance — BLOCKED

No nonproduction project is accessible in the connected Supabase account. No staging credentials or authorized account manifest were provided. `eas.json` has a preview build profile, but that does not establish a separate backend. No adb/xcrun or physical device is available. Production must not be used as staging.

## Exact environment preparation

1. An authorized operator provisions a separate Supabase project in the intended region and connects it to this session. Use a distinct project reference, database, Auth tenant, Storage buckets and Realtime publication. Do not use production's default main branch. Confirm billing before creating a new paid resource. Project reference is safe to share; put database credentials and test passwords/tokens in the approved secret manager only.
2. Obtain a production **schema-only** export through authorized database access. Preserve public/private schemas, functions, triggers, grants, policies, extensions and Realtime configuration; do not copy customer records, Auth users, payment accounts, secrets, checkout sessions or settlement data. Review cron jobs, database webhooks and Edge Function integrations so staging cannot contact production services. Schema dumps may contain operational configuration; keep them in protected storage.
3. Reconcile the four remote-only migration entries and the 209 source fingerprints not byte-matched in `migration-inventory.json`. Version/name presence is not semantic equivalence. Capture missing authoritative SQL into a separately reviewed baseline package; do not invent replacement history or run repair. Restore that package to disposable PostgreSQL, then the new staging project. A complete baseline replay is not established by this session's focused fixtures.
4. Capture source project identity and target identity separately. Have an operator verify staging DB/API host differs from `bmwbljefnamvjnmuvkvv.supabase.co`. Configure local/preview app with staging EXPO_PUBLIC_SUPABASE_URL and publishable key. Never ship a service-role key. Retain the Phase 6 branch deployment-disable rule; do not point a production app at staging.
5. Use Supabase Auth to invite two test customers (comments need independent sessions), a verified provider owner, an unverified provider, active staff and removed staff. Seed only clearly labelled synthetic staging businesses, services, availability and membership rows. Create an administrator using the existing privileged provisioning process and enroll real TOTP MFA; require password plus MFA in its session. Do not put authorization in user-editable metadata or fake JWT/AMR claims.
6. Seed separate staging posts for comment author/post owner, private and unavailable posts; known private business/customer rows; and Sydney/Melbourne provider/request coordinates. Record IDs, intended roles and expiry/cleanup in a protected test manifest. Do not record passwords or bearer tokens in repository evidence.
7. Confirm recovery: a recent restorable backup/PITR window, retention and operator permissions for source and staging. Restore the staging baseline, apply the five reviewed SQL files in the documented order, roll them back to exact saved definitions/ACLs, then reapply. Record checksums and actual restore times. No recovery capability or rehearsal has been verified here.

Verified CLI 2.81.0 commands for an operator with approved connection variables (not executed remotely):

```sh
supabase db dump --db-url "$EVEREST_SOURCE_DB_URL" --schema public,private --file "$EVEREST_PROTECTED_SCHEMA_FILE"
supabase migration list --db-url "$EVEREST_STAGING_DB_URL"
supabase db push --db-url "$EVEREST_STAGING_DB_URL" --dry-run
```

Use a clean migration checkout without postinstall-generated aliases. A dry-run must contain exactly the reviewed five pending files. If any historical/unrelated SQL appears, stop. Never `--include-all`, reset, blanket push or repair history. Review managed Auth/Storage/extension restore requirements separately; the schema command alone is not a complete Supabase environment clone.

## Acceptance record to fill with real sessions

| Gate | Required evidence | Current result |
| --- | --- | --- |
| Guest/customer/provider/staff/removed staff/admin | Actual PostgREST SELECT/EXECUTE/write-denial checks; anonymous public-only search, no private/unverified leak, real password+MFA admin | BLOCKED |
| Full lifecycle | Request → matching → Live offer → quote/provider response → customer decision → pending-payment booking → existing authorized assignment/payment/completion path; inspect database state at every transition | BLOCKED |
| Geographic and availability boundaries | Sydney/Melbourne exclusion, exact radii, legitimate remote matching, future availability, removed staff assignments | BLOCKED |
| Concurrency and recovery | Two independent provider sessions; two customer devices; expired offers; cancellation races; offline provider; dropped response; duplicate submissions; inspect at-most-one assignment/booking | BLOCKED |
| Comments | Two real customer sessions; realtime insert/reply/edit/hide; forbidden hide; hidden-row SELECT denial; reconnect missed events; pagination/stale/double-send; unavailable post and permission loss | BLOCKED |
| Mobile | Physical iOS/Android maps, permission denial/refresh, safe areas, real keyboard/IME/navigation, screen reader/focus/touch targets, both themes | BLOCKED |
| Restore and rollout rehearsal | Full production-schema replay; five reviewed migrations; pre/post catalog/ACL/RLS comparison; exact rollback/reapply | BLOCKED |

Do not bypass payment/completion guards or fabricate payment success to finish the lifecycle. No Stripe configuration, amounts, commissions or settlement changes are authorized. Record test transport and device/OS versions; intercepted browser traffic is not staging evidence.

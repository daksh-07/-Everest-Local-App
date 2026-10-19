# Checkpoint B — matching correction

Regression tests were committed before the correction. Against the previous function all three targeted contracts failed (0 pass / 3 fail). The new migration and expanded suite pass 33 / 33 in PGlite and independently in PostgreSQL **17.6**, the production major/minor version. Fixtures contain synthetic data only; the PostgreSQL instance binds loopback and each run creates/drops its own disposable database. The runner rejects non-loopback database URLs.

Root causes and selected rules:

1. The outer `OR exists(service_areas...)` escaped both wave radius and provider radius predicates, even for missing coordinates. For local Live work, a named area is descriptive coverage, not authority to exceed either radius. Nearby providers remain eligible without a named-area row. Local candidates require coordinates and both existing distance limits. Remote capability matching stays global and does not require coordinates.
2. AVAILABLE_NOW checked `available_until` but ignored `available_from`. It now requires null/past/present start and an unexpired end. Remote providers obey the same availability window.
3. The busy-assignment anti-join omitted membership status. It now joins ACTIVE members only, consistently with the existing location/radius calculations. Unfinished work belonging to active members still excludes the business; removed/suspended memberships and completed assignments do not.

Only `release_everest_live_wave` is replaced. Request row locking, service/niche/category constraints, verified/active/provider opt-in checks, uniqueness, duplicate suppression, match scoring, expiry boundaries, auditing and owner-only execution remain unchanged. Existing offers are not rewritten, and no schema, RLS or payment behavior is changed.

The business-level rule still excludes the entire business when an active member has unfinished dispatch work. Changing capacity to a per-employee model is outside this defect fix. The existing max-online-member radius rule is also preserved.

Migration: `20261019034703_phase6_live_matching_correctness.sql` (created with Supabase CLI). Not applied to production. See `sql/live-before.json`, `sql/live-after-pglite.json`, `sql/live-after-postgres17.json` for exact case results. Acceptance concurrency is verified separately, not inferred from these single-session matching tests.

# Checkpoint C — discovery reconciliation

Reviewed #107 head `068566b` against production main `95b8d48`. Only `vercel.json` conflicts. Combined all existing branch-disable rules and added this Phase 6 branch; Home/Search/Profiles/Today and the shared accessibility fixes apply cleanly. #108 operational helpers/Live and #109 Social/comments are retained. No #97 wholesale merge. The discovery migration remains the exact independently reviewed #107 file (80 lines).

28/28 focused permission checks pass in PostgreSQL 17.6 and PGlite, using synthetic guest/customer/provider/staff/admin identity settings. They cover public-only listing projections, private/unverified/inactive/draft/opt-out exclusion, blocked users, private social branch denial to guests, booking-setting two-column grants plus row policies, unauthorized writes, direct identity-helper denial, pagination and the real password-plus-MFA administrator predicates. Provider/staff here are separate authenticated identities; this migration adds no operational membership privilege. These are focused schema fixtures, not full production-schema certification or Supabase-issued sessions.

The original #107 exact-migration suite also passes. TypeScript and lint pass (0 errors, 11 existing hook warnings). Current-main web export succeeds. Cross-feature browser checks follow in checkpoint D.

No migration was applied to production. There is no separate accessible staging project/branch or authorized account setup, so live identity/REST/realtime verification remains blocked.

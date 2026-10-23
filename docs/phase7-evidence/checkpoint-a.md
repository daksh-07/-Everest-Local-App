# Checkpoint A — 2026-10-19

Main and public production build remain `95b8d489c98109717bcb8d6ef53d54674c4b5ab7`. PR #110 is OPEN, ready for review and MERGEABLE at `152188f`. Continuing that branch, no overlapping PR.

Supabase has one accessible project, production `bmwbljefnamvjnmuvkvv` (ACTIVE_HEALTHY, PostgreSQL 17.6). Only the default main branch exists. Its MIGRATIONS_FAILED record was last updated 2026-09-17; it is historical metadata, not proof of a current outage. Remote history contains 239 entries ending `20261003050944`; inventory reconciliation follows. No nonproduction project, staging credentials/account setup or physical devices are available. A setup question is pending; local work continues.

Vercel project listing works, but production deployment listing returns 403 for the connected scope. No Vercel CLI credentials are configured. Public build-info plus GitHub deployment metadata provide read-only fallback; deployment management/recovery access must be restored before release. No production mutation was made.

Phase 6 transaction suite repeated in loopback PostgreSQL: 20/20 contracts pass while its known-finding evidence records 40P01. The strengthened test holds only the common request row and exercises both unmodified API functions; it does not prelock quotes outside the API. This makes the no-deadlock requirement an actual assertion.

Next: run the strengthened regression red, then implement request-first ordering with ownership revalidation. Stage only the new reviewed migration; never blanket-push historical migrations.

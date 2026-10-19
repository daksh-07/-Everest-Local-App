# Resumption and release gate

Branch: `codex/phase6-backend-hardening`, based on deployed/main `95b8d48`. Review PR #110. Production remains unchanged. Read checkpoint A/B/C/D notes and ROLLOUT.md before continuing.

Completed source: three Live matching fixes, #107 reconciliation (only vercel.json conflicted), actual-RLS comment moderation correction, and Live MATCHING-to-QUOTING boundary correction. Live action-failure feedback now survives healthy background reads; deterministic held-response browser coverage reproduces the previous loss. No payment functions changed. SQL evidence is in sql/; independent provider acceptance passes while customer quote contention records a 40P01 deadlock without duplicate bookings.

Staging gate is blocked: only the production Supabase project is accessible. Never use its default main branch as staging. No staging test accounts or physical devices were supplied. A request for nonproduction project/account setup is pending in the conversation.

Local runtime: `/tmp/everest-phase6-tools` contains isolated PostgreSQL 17.6 binaries and pg 8.16.3; server is loopback port 55436 with synthetic data only. The SQL runner creates/drops a unique disposable database and rejects remote URLs. `/tmp/everest-qa` contains isolated Playwright/axe. App export is served on 8087. If the environment restarts, rebuild these temporary tools; repository scripts and evidence are durable. A fresh worktree may need an Expo `--clear` export to avoid stale route context from shared node_modules.

Repeat SQL (these commands cannot target a remote database):

```sh
export PHASE6_DATABASE_URL=postgresql://postgres@127.0.0.1:55436/postgres
export PG_MODULE=/path/to/isolated/pg/lib/index.js
node scripts/verify-phase6-live.mjs
node scripts/verify-phase6-live-flow.mjs
node scripts/verify-phase6-permissions.mjs
node scripts/verify-phase6-comments-sql.mjs
node scripts/verify-phase6-transactions.mjs
```

The release README records final browser/quality results and CI status. Preserve the no-deployment branch rule. Do not merge/release solely because focused fixture tests pass; complete the staging and physical-device gates and resolve/review remaining blockers first.

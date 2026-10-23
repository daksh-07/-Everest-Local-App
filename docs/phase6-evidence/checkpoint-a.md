# Checkpoint A — 19 October 2026

- Verified origin/main and production `/build-info.json`: `95b8d489c98109717bcb8d6ef53d54674c4b5ab7`.
- GitHub production deployment 7165175037 reports success at `https://everest-local-7k76onzdi-dakshgolani5-4632.vercel.app`.
- #108 merged as `846cf41`; #109 merged as `95b8d48`, latest reviewed source head `f233498`. Their evidence and current source were inspected.
- #107 remains OPEN at `068566b7267b220e4005e81e49d34a0d23771ca2`. Merge-tree against current main conflicts only in `vercel.json`; its deployment-disable rules must be combined. No #97 branch merge is planned.
- Read-only production catalogue inspection confirms `release_everest_live_wave(uuid,numeric,integer)` is SECURITY DEFINER with owner-only execution and contains all three reported problematic predicates. `pg_get_functiondef` MD5: `58197205f039ca886ccea566b8f54309`.
- Production `universal_search(text,text,integer,integer)` is SECURITY DEFINER, executable only by postgres/authenticated, not anon. Definition MD5: `0c9f8a9e682ad78e41376301b78fb2db`.
- Supabase connector is available. Only project `bmwbljefnamvjnmuvkvv` (production, PostgreSQL 17.6) is listed. Branch listing contains only its default main entry (historical MIGRATIONS_FAILED status). No nonproduction project, staging identities or physical devices are supplied. Do not treat this main entry as staging. No production test writes or DDL are authorized.
- Vercel connector reports no accessible teams; GitHub deployment metadata and public build provenance independently establish deployment state.
- Production security advisors were read without mutation. Findings include 23 RLS-enabled tables without policies (deny-by-default is not automatically a defect), 5 anonymous SECURITY DEFINER APIs requiring intentional-exposure review, many authenticated SECURITY DEFINER APIs requiring per-function authorization review, and disabled leaked-password protection. This is not a clean security certification; no broad permission changes will be used to silence advisors.
- Previous evidence does not verify real Supabase websocket delivery, push, physical maps/keyboards/assistive technology or multi-session acceptance. Disposable PostgreSQL, explicit identity tests and browser fixtures will be labelled separately.

Scope: a new branch from verified main. No deployments, production migrations, payment/pricing/commission changes, or dependency upgrades. Rollout remains separately gated.

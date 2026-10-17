# UI release — 17 October 2026

An isolated release from main, reusing PR #105's completed messaging and narrow booking-layout fixes. The owner explicitly requested production merge/deployment. No payment, Supabase, inventory, RLS, dispatch or market configuration changes are included. PR #105 remains separate pending its backend rollout prerequisites.

The local suite passes 455 tests. TypeScript, web export and lint pass (12 existing warnings). Real-screen browser fixtures cover compact composer sizing, keyboard viewport transitions, multiline input, send/failure recovery, history anchoring, drafts and navigation, plus booking price/progress/overflow at 320/375/390/430/1280 in both themes. Exact browser results are recorded in the adjacent JSON files and release PR.

The first local symlinked-worktree export had an empty cached route context; a clean Metro export rebuilt the actual application before browser acceptance. Local fixture tests do not exercise production data, Stripe payments, actual Apple keyboards or physical iPhone acceptance. No such acceptance is claimed.

Images show the actual exported screens. Messaging keyboard occlusion is simulated and does not depict an iOS system keyboard.

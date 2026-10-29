# Combined marketplace integration — 30 October 2026 (Sydney)

## Verified starting state and candidate

GitHub was reread before editing. #113–#117 remain open, ready for review, mergeable and unmerged, with their exact source workflow runs successful. #117 is `9f12458682c18c9c476446fc10308170244a5b5a`. Production is READY at `ed013dec0e1a11ad628663bc0fd723a8600ce7ee`. #105 remains open at `29ab83da8eb3d286349188f63f195f7397314d56`, targets main and conflicts. Its seven transaction commits are absent from production; it is not obsolete. Independently released messaging/layout work is already present through #106 and later fixes.

The dedicated `codex/reconcile-marketplace-20261030` candidate combines #117 (including #113–#116) with #105 as a genuine two-parent merge. Review the combined PR against `integration/final-release-20261023`; do not merge the five prerequisites separately and then accidentally replay an older transaction snapshot. No merge to a shared release branch or production deployment is authorised by this record.

## Conflict decisions

| File | Reconciliation and reason |
|---|---|
| Discovery workflow | Retain both the newer Phase 5/browser/permission checks and #105 commerce acceptance. Enable combined-source gates for integration-targeted PRs. |
| Booking | Retain #105 checkout return/polling, mounted/operation guards and independent job/review recovery; restore newer locale time, known quote deposit amount and clear pending/confirmed headings. An unavailable quote displays Review payment rather than guessing full upfront payment. |
| Business orders | Retain #105 scoped merchant permissions, order details, confirmation-before-change and paid pickup collection. Preserve button semantics. |
| Cart | Retain stock-aware variants, immutable pending checkout, independent busy states and validation/focus; restore product thumbnails with stale/unmounted read guards. |
| Messages | Keep all newer counterpart names, read receipts, date separators and person icons. Result matches #117 exactly; the already released keyboard/viewport work remains. |
| Product | Combine #105 stock/quantity/operation guards, retry and deep-link back recovery with newer typography, touch sizes, product enquiry and button roles. Restore sign-in preflight before any guest cart mutation. Avoid duplicate quantity/business cards introduced by a naive merge. |
| Commerce library | Combine stock and pending-order contracts with the newer guest cart no-read/no-create guard and image relation. Execute actual compiled helper regressions for signed-out reads and relation normalization. |

No commission formula, direct-charge account routing or authorisation policy was selected by guesswork. Imported Edge/migration changes retain #105 intent and require separate backend rollout review; they are not live.

## Database and hosted dependencies

Read-only deployed metadata confirms `20261017071853_phase4_order_inventory_and_pickup.sql` is **not recorded**, and `claim_order_checkout(uuid)` / `complete_pickup_order(uuid)` are absent. The latest remote migration version is `20261025084317`; the older pending migration requires an explicit reviewed migration plan, not a blind default push or renaming an applied history entry.

The proposed migration and matching checkout/webhook functions must be reviewed and staged together. Follow #105's rollout gates: pause checkout, reconcile pending/action-required orders, physical/variant reservations and externally payable legacy sessions, apply the approved migration, deploy matching functions, verify signed webhooks, and only then restore traffic. SQL cannot infer Stripe session state. `APP_PUBLIC_URL` must be a trusted HTTPS deployment origin. No migration, function deployment, credential change or live transaction was performed here.

Fresh Supabase inventory still exposes only Everest Local and an unrelated client project. Everest has no separate healthy test branch: its sole default branch record has historical MIGRATIONS_FAILED metadata from 17 September; the production project itself remains ACTIVE_HEALTHY. Stripe connector discovery returns UNAUTHORIZED / reauthentication required, so even test-account availability cannot currently be confirmed. No new infrastructure was provisioned or paid for.

Hosted request → quote → booking → Checkout → signed webhook → completion/payout, payment failure/interruption, duplicate webhook delivery, refunds, authorisation failures and connected-account restrictions remain blocked on a properly isolated backend and authorised Stripe test account. Actual Edge handlers, Postgres/PGlite contracts and exported UI fixtures cover safely reproducible cases; they do not establish hosted acceptance.

## Security and verification boundaries

The read-only security advisor reports generic callable-definer warnings and RLS-without-policy informational findings, plus disabled leaked-password protection. These require intent/ACL review; they are not proof that every reported function is vulnerable, and private RPC-only tables must not receive blanket public policies. No live security settings were changed. Advisor reference: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable and https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection .

Local merged-source unit/security suite passes **589 tests**, including imported executable Edge harnesses, 13 inventory/pickup SQL cases and two added guest-cart/relation regressions. Typecheck passes; lint has zero errors and eleven pre-existing warnings. Final browser, native export, CI and preview results are recorded in the combined PR after completion. Historical #105 screenshots/reports keep their original provenance; new run artifacts are separate. Physical devices, background push, VoiceOver/TalkBack and real hosted money paths remain unverified.

## Integration and rollback

Keep #105 and #113–#117 open until the combined candidate is reviewed and accepted. Do not recommend closing #105 as obsolete. After approval, merge the reviewed combined candidate once, verify its release source, and close superseded PRs only with their replacement link. Backend rollout is a separate gated action. Reverting the frontend merge is not a sufficient rollback after inventory migration or live sessions; preserve the backend reconciliation/rollback plan and inspect provider state.

The complete journey status/device checklist remains in `EVEREST_JOURNEY_COMPLETION.md`. Global service-area and product shipping eligibility is still incomplete; a country directory does not establish checkout serviceability.

## Follow-up: country authority and photo recovery

All ten workflow runs on published integration merge `cf81cfd` completed successfully, including native-store and WebKit jobs. This result applies to that source, not subsequent edits.

The follow-up adds authoritative local-service country guards, explicit domestic product fulfilment country checks and an immediate photo-reattachment/continue-without decision after draft recovery. See `EVEREST_MARKETPLACE_ELIGIBILITY.md` for implementation limits and rollout gates. The full local suite including the additional checkout rollback case passed 614 tests, with typecheck passing and zero lint errors (eleven existing warnings); final browser and follow-up CI are pending. No hosted or physical-device acceptance is claimed.

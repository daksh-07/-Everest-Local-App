# Everest Local — Final Launch Gate

**Audited repository head:** `581de9f87c3467c5216fb62236410137aae1eec0`  
**Status:** `NOT LAUNCH READY — EXTERNAL VALIDATION REQUIRED`

A gate is only `VERIFIED` when the stated evidence actually exists. A green GitHub Actions run proves source/build validation; it does not prove live Supabase, Stripe, native-device, provider or store behavior.

## Status legend

- **VERIFIED** — actually tested successfully.
- **PARTIALLY VERIFIED** — implementation and source/CI evidence exist, but live execution remains.
- **UNVERIFIED** — not tested.
- **MISSING** — functionality is absent or materially incomplete.
- **BLOCKED BY HUMAN CONFIGURATION** — the test or completion requires an external account, secret, deployed service, provider, device or operator action.

## Code / repository gates

| Gate | Status | Evidence |
|---|---|---|
| TypeScript | PARTIALLY VERIFIED | Previous run #175 passed; SDK 54 dependency alignment is awaiting current CI completion. |
| ESLint | PARTIALLY VERIFIED | Same boundary as TypeScript. |
| Static security/navigation audit | PARTIALLY VERIFIED | Run #175 passed; rerun required after dependency update. |
| Migration audit | PARTIALLY VERIFIED | Run #175 passed for migrations 001–032; rerun required after dependency update. |
| Security invariant tests | PARTIALLY VERIFIED | Run #175 passed; rerun required after dependency update. |
| Expo Doctor | PARTIALLY VERIFIED | Run #175 passed on SDK 53; SDK 54 result must be observed before release. |
| Expo web export | PARTIALLY VERIFIED | Run #175 passed; SDK 54 result must be observed. |
| Edge Function type checks | VERIFIED | Run #176 completed successfully for all Edge Functions; no dependency change affects Deno source. |

## Database / authorization gates

| Gate | Status | Required evidence |
|---|---|---|
| Production/staging Supabase configured | BLOCKED BY HUMAN CONFIGURATION | Project and credentials supplied securely. |
| Clean migration application 001–032 | BLOCKED BY HUMAN CONFIGURATION | `docs/SUPABASE_DEPLOYMENT.md` procedure executed. |
| Customer A/B RLS isolation | BLOCKED BY HUMAN CONFIGURATION | Live adversarial matrix. |
| Business A/B RLS isolation | BLOCKED BY HUMAN CONFIGURATION | Live adversarial matrix. |
| Admin authorization | BLOCKED BY HUMAN CONFIGURATION | Live admin/non-admin RPC tests. |
| Delivery Driver authorization | BLOCKED BY HUMAN CONFIGURATION | Live assigned/unassigned driver tests. |
| Lifecycle transition enforcement | BLOCKED BY HUMAN CONFIGURATION | Live invalid/duplicate transition matrix. |

## Authentication gates

| Gate | Status |
|---|---|
| Registration | BLOCKED BY HUMAN CONFIGURATION |
| Login/logout/session persistence | BLOCKED BY HUMAN CONFIGURATION |
| Invalid/expired session handling | BLOCKED BY HUMAN CONFIGURATION |
| Password recovery | BLOCKED BY HUMAN CONFIGURATION |
| Native `everestlocal://` recovery | BLOCKED BY HUMAN CONFIGURATION |
| Web recovery redirect | BLOCKED BY HUMAN CONFIGURATION |
| Account deletion | PARTIALLY VERIFIED — source path exists; live auth execution remains |

## Service marketplace gates

| Gate | Status |
|---|---|
| Request / deterministic matching | PARTIALLY VERIFIED |
| Opportunity / quote | PARTIALLY VERIFIED |
| Quote acceptance / booking creation | PARTIALLY VERIFIED |
| Messaging participant authorization | BLOCKED BY HUMAN CONFIGURATION |
| Service deposit payment | BLOCKED BY HUMAN CONFIGURATION |
| Booking lifecycle | BLOCKED BY HUMAN CONFIGURATION |
| Completion / review eligibility | BLOCKED BY HUMAN CONFIGURATION |
| Duplicate/invalid action handling | BLOCKED BY HUMAN CONFIGURATION |

## Product marketplace gates

| Gate | Status |
|---|---|
| Product management/publication | PARTIALLY VERIFIED |
| Inventory authority | PARTIALLY VERIFIED |
| Cart ownership/concurrency | PARTIALLY VERIFIED |
| Server-authoritative checkout | PARTIALLY VERIFIED |
| Pickup checkout | BLOCKED BY HUMAN CONFIGURATION |
| Everest Delivery checkout | BLOCKED BY HUMAN CONFIGURATION |
| Order lifecycle/visibility | BLOCKED BY HUMAN CONFIGURATION |
| Concurrent/insufficient-inventory races | BLOCKED BY HUMAN CONFIGURATION |

## Stripe gates

| Gate | Status |
|---|---|
| Secret isolation | VERIFIED at source/CI level |
| Webhook signature verification | VERIFIED at source/CI level |
| Event idempotency architecture | VERIFIED at source/CI level |
| Successful product payment | BLOCKED BY HUMAN CONFIGURATION |
| Failed payment | BLOCKED BY HUMAN CONFIGURATION |
| Expired checkout | BLOCKED BY HUMAN CONFIGURATION |
| Duplicate webhook | BLOCKED BY HUMAN CONFIGURATION |
| Webhook retry | BLOCKED BY HUMAN CONFIGURATION |
| Invalid signature | BLOCKED BY HUMAN CONFIGURATION |
| Service deposit payment | BLOCKED BY HUMAN CONFIGURATION |
| Incorrect client price/total resistance | PARTIALLY VERIFIED — source/security invariant; live exploit test remains |

Stripe Connect/KYC/payouts/transfers/refunds/disputes are **outside current MVP scope** unless the operator explicitly expands the launch requirements.

## Delivery gates

| Gate | Status |
|---|---|
| Delivery eligibility | PARTIALLY VERIFIED |
| Business delivery request | BLOCKED BY HUMAN CONFIGURATION |
| Admin driver assignment | BLOCKED BY HUMAN CONFIGURATION |
| Driver authorization | BLOCKED BY HUMAN CONFIGURATION |
| Pickup / transit / delivered | BLOCKED BY HUMAN CONFIGURATION |
| Cancellation/failure | BLOCKED BY HUMAN CONFIGURATION |
| Paid-order integrity on failure | PARTIALLY VERIFIED at source level |
| Participant notification records | PARTIALLY VERIFIED |
| External logistics/maps | MISSING / outside MVP |

## Ask Everest gates

| Gate | Status |
|---|---|
| Auth required / request limits | PARTIALLY VERIFIED at source level |
| Server-only AI credentials | VERIFIED at source/static audit level |
| RLS-scoped marketplace context | PARTIALLY VERIFIED at source level |
| No authoritative transaction decisions | PARTIALLY VERIFIED at source level |
| Provider success/timeout/failure | BLOCKED BY HUMAN CONFIGURATION |
| Production prompt/data evaluation | BLOCKED BY HUMAN CONFIGURATION |

## Native / store gates

| Gate | Status |
|---|---|
| Expo SDK 54 dependency alignment | PARTIALLY VERIFIED — CI pending at audit time |
| Android target API 36 source requirement | PARTIALLY VERIFIED — SDK 54 supplies target API 36; native build still required |
| iOS physical-device test | BLOCKED BY HUMAN CONFIGURATION |
| Android physical-device test | BLOCKED BY HUMAN CONFIGURATION |
| Native deep links | BLOCKED BY HUMAN CONFIGURATION |
| EAS signing/accounts | BLOCKED BY HUMAN CONFIGURATION |
| Store submission configuration | BLOCKED BY HUMAN CONFIGURATION |
| Privacy URL / Terms URL / support URL | BLOCKED BY HUMAN CONFIGURATION |
| Account-deletion web resource | BLOCKED BY HUMAN CONFIGURATION |
| App Store / Play data disclosures | BLOCKED BY HUMAN CONFIGURATION |

## Operations / observability

| Gate | Status |
|---|---|
| Controlled real-business onboarding | BLOCKED BY HUMAN CONFIGURATION |
| Real products/services/pricing | BLOCKED BY HUMAN CONFIGURATION |
| Support process | BLOCKED BY HUMAN CONFIGURATION |
| Payment/webhook operational alerting | MISSING |
| Client crash reporting | MISSING |
| Push/email/SMS provider | BLOCKED BY HUMAN CONFIGURATION if enabled |

## Launch decision

### Controlled private beta

**Conditionally possible only after the external staging gate is completed.** The repository is not sufficient by itself to authorize real customer transactions. The minimum private-beta prerequisite is a configured Supabase environment, live RLS tests, Stripe test-mode transaction matrix, native builds/devices, Auth recovery validation and real controlled marketplace onboarding.

### Public launch

**Not ready.** Public release additionally requires production backend/payment configuration, native release builds/signing, legal/privacy/support URLs and store declarations. Monitoring/alerting should be in place before broad public traffic.

## Human launch sequence

1. Wait for the SDK 54 CI run to pass completely.
2. Configure a staging Supabase project and apply migrations cleanly.
3. Execute the adversarial RLS/authorization matrix.
4. Configure Stripe test mode and run the complete payment/webhook matrix.
5. Configure Auth redirects and test recovery on physical iOS/Android plus web.
6. Build internal EAS preview builds and exercise service/product/delivery flows.
7. Configure AI/notifications/delivery providers only if included in beta scope.
8. Add only real verified marketplace participants and real catalog/pricing data.
9. Operate a controlled beta and record failures/operational evidence.
10. Finalize legal/store/monitoring configuration and rerun the final gate before public submission.

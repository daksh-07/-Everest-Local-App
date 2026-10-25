# Verification artifacts

- [Machine summary](validation-summary.json): exact code SHA, unit/SQL/doctor results and per-engine matrix sizes.
- [Engineering CI](ci-source-0cf8216.json): 17 successful checks, one skipped Supabase Preview on `0cf82161a09739d2f60f436e4b2984277df3ecb4`.
- [Native CI](native-ci-source-0cf8216.json): successful Android AAB and iOS toolchain/config/pods/release simulator compile steps and job URLs.
- [Browser reports](browser): actual exported app with intercepted APIs/Auth/realtime; 58 scenario groups, 816 responsive checks and 38 axe scans per engine. Widths 320/375/390/430/768/1024/1280/1440. Zero final errors and violations.
- [Initial browser failures](initial-browser-failures.json): retained as failed; final immutable-export reruns pass without assertion changes.
- [Unit suite](unit-final.log): 506 passed, none failed/skipped.
- [Mutation regression before](social-mutations-before.log) and [after](social-mutations-after.log): 1/14 versus 14/14; null/false/zero-row writes cannot report success.
- [Migration alias cleanup](migration-alias-cleanup.log): four filesystem safety cases.
- [SQL](sql): 133 PostgreSQL checks in total, including 21 guest/block/identity/admin/ACL/transactional rollback contracts. [PGlite](pglite) independently repeats 61 matching/discovery cases. These are controlled schema fixtures, not complete Supabase staging.
- [Expo Doctor](expo-doctor.log), [TypeScript](typecheck.log), [ESLint](lint.log), [static audit](static-audit.log), [migration audit](migration-audit.log) and [native prebuild](native-prebuild.log).
- [Production build metadata](production-final.json): unchanged `95b8d489c98109717bcb8d6ef53d54674c4b5ab7`.
- [PR closures](pr-closures.json), [remaining open PRs](open-prs-final.json), [GitHub deployment metadata](github-deployments.json) and [remote Edge Function metadata](production-edge-functions.json).
- Selected inspected screenshots: [320px true-black Home](screenshots/home-dark-320.png), [390px retained search error](screenshots/search-retained-error.png).

All final browser artifacts use an immutable local export with `build-info.commit=0cf82161a09739d2f60f436e4b2984277df3ecb4`. The local WebKit launch used supplied user-space libraries and a loader-cache validation override; actual browser tests and zero-error/axe assertions were kept. GitHub installed system libraries normally. No real production transaction, real Auth acceptance or physical-device result is implied by these artifacts.

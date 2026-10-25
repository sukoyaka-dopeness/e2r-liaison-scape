# LiaisonScape 0.2.3 maintenance release candidate — 2026-10-25

Status: **LOCAL 0.2.3 MAINTENANCE RELEASE CANDIDATE / NOT PUBLISHED / PUBLIC HTTPS VERIFICATION PENDING / FORMAL PUBLICATION CLOSURE PENDING**.

## Decision and scope

Human approved `0.2.3` as the next maintenance/patch Application Version, centered on the [Diagnostics D2-FIX1 correction](liaisonscape-diagnostics-d2-dataset-change-reevaluation-implementation-2026-10-25.md). Diagnostics D2 is **FORMAL HUMAN ACCEPTED / CLOSED (BOUNDED)** only for Current Dataset Diagnostics re-evaluation after a committed Dataset change. Implementation commit `e1eba83c3f3bbee4929a3c9af44acda378482812`, bounded Human Browser Acceptance commit `7fc766dec28a28246f0431659ada7d3186ea82b7`, and Formal Closure commit `309de6c2218d0a256784ac9f4e902c1b5095df3e` remain separate evidence. The accepted implementation is unchanged by this release candidate.

The published `0.2.2` application source is `e5bcd8accd0a44ad51b04b825e8ebbc3a25a96a4`; its [bounded Publication Closure](liaisonscape-0.2.2-publication-and-human-review-2026-10-25.md) is historical and unchanged. The later documentation-only GitHub main at `7987032731b4c83baaa2cf48aefa7d719cb03cdb` does not contain D2-FIX1. This `0.2.3` candidate is local and has no Public HTTPS or Publication Acceptance.

## Release metadata

| Field | Local candidate | Publication boundary |
| --- | --- | --- |
| Application Version | `0.2.3` in Credits, private package metadata, lockfile, and EN/JA Credits tests | Human approved the version; the public app remains `0.2.2` until a separately authorized deployment succeeds. |
| First release | `2026-08-16` | Historical date retained. |
| Credits Updated | `2026-10-25` | Last confirmed application publication date for `0.2.2`; the actual `0.2.3` publication date is **not yet confirmed**. |
| E2R Validator | Published `0.7.0` | Dependency unchanged. |

The local Credits therefore combine the approved next Version with the last confirmed Updated date. This is an unpublished release candidate, not a claim that `0.2.3` was released on `2026-10-25`. Before Push, Human must confirm the actual JST publication date. If it differs, update EN/JA Credits, related tests, README, and this record, then revalidate and review the new exact Commit range. Even if publication occurs on `2026-10-25`, the date must be explicitly confirmed against the actual deployment plan.

## Evidence and remaining gates

The implementation checkpoint reported 675/675 tests, lint, build, and diff check PASS. A later read-only audit reported five targeted tests PASS. Human reported D2-01–D2-06 Browser PASS within the [bounded D2 record](liaisonscape-diagnostics-d2-dataset-change-reevaluation-implementation-2026-10-25.md), including EN/JA warning transitions, candidate/current separation, Cancel preservation, and inspection of exported E2R JSON. These precede the `0.2.3` metadata change and are not a new Browser review of this candidate.

For this `0.2.3` metadata candidate, `npm test` passed **675/675** with zero TAP failures; `npm run lint`, `npm run build`, and `git diff --check` passed. A targeted Workspace Credits test also passed after its Version expectation was aligned. The generated JS includes Version `0.2.3`, First release `2026-08-16`, and Updated `2026-10-25`. The DOM suite emitted the previously observed, non-failing React input-polyfill console TypeErrors. These are current automated and asset checks, not Browser Acceptance.

Human review of changed EN/JA Credits Version and the final Updated date is pending. Push authorization must identify the exact remote base and local HEAD. A `main` Push triggers the existing GitHub Actions tests, lint, build, and Pages deployment; successful Push alone will not establish deployment, Public HTTPS verification, or Formal Publication Closure.

Operation-specific Diagnostics display lifetime remains **OPEN / HUMAN BROWSER REVIEW PENDING**. Candidate replacement-dialog code/path presentation remains **OPEN / UI QUALITY FOLLOW-UP**. Neither is included in `0.2.3`. Diagnostics D1's bounded closure, Validator `0.7.0`, the Lighthouse JA warnings, LS-DA-PRESERVE2's bounded acceptance, Dimension Assessment `0.2.0` non-Stable Candidate status, and Cross-Context Workspace Safety PENDING remain unchanged.

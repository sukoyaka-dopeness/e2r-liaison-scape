# LiaisonScape 0.2.3 maintenance release candidate — 2026-10-25

Current status: **0.2.3 PUBLISHED / CI AND PAGES PASS / PUBLIC HTTPS TECHNICAL VERIFICATION PASS / PUBLIC HTTPS HUMAN BROWSER ACCEPTED (BOUNDED) / FORMAL PUBLICATION CLOSURE HUMAN ACCEPTED / CLOSED (BOUNDED)**. The release-candidate sections below retain their pre-publication checkpoint; the subsequent publication and Human decision sections at the end are the current result.

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

## Subsequent bounded local Human Browser Acceptance and publication

Human approved `2026-10-25 JST` as the planned `0.2.3` publication date, and deployment completed on that same JST date. Human-provided local-review screenshots showed the EN/JA Home Credits, Version `0.2.3`, First release `2026-08-16`, Updated `2026-10-25`, and basic Home presentation. Human subsequently reported **PASS** for Workspace Credits, Close/Escape/Backdrop dismissal, focus restoration, and locale switching, and expressly accepted this combined **local Browser Review within those bounds**. Browser name, exact viewport, interaction recordings, and screenshot files are not recorded here; Codex did not operate a browser. This does not establish Public HTTPS Human Browser Acceptance or revisit the separate D2-01–D2-06 decision.

Human explicitly authorized the ordinary fast-forward Push of exactly `7987032731b4c83baaa2cf48aefa7d719cb03cdb..33732e8307579df6de00f8f89d5a19341f449abb` (four existing commits) to `origin/main` and the resulting Pages auto-deployment. Pre-Push remote, local HEAD, metadata, ancestry, and worktree scope matched the approved values. The Push succeeded, and GitHub `main` reached application source `33732e8307579df6de00f8f89d5a19341f449abb`. No tag or GitHub Release was created.

[Actions run 40183570153](https://github.com/sukoyaka-dopeness/e2r-liaison-scape/actions/runs/40183570153) completed successfully for that SHA: **675/675 tests**, lint, build, Pages artifact upload, and Pages deployment passed. The GitHub Pages deployment status was `success` at **2026-10-25 19:11:29 JST**. The [public application](https://sukoyaka-dopeness.github.io/e2r-liaison-scape/) returned HTTP 200 for HTML, JS, and CSS. Its JS and CSS SHA-256 hashes matched the local verified `0.2.3` build (`465AEA2CE4D8D9567F62978AC4A63E46B5B95CC978D8E7CFC47BC13DC13CFBE6` and `6D9EFE573B96C3AA722101A86555EC41E1F8EA0600EF21016912FF9DDAD880E0`); the served JS contains Version `0.2.3`, First release `2026-08-16`, and Updated `2026-10-25`. This is HTTP/asset and source-marker evidence, not an operated public-browser check. Matching assets support that the published application includes D2-FIX1; they do not establish a new Human D2 review.

At this post-deployment evidence checkpoint, Public HTTPS Human Browser Acceptance and `0.2.3` Formal Publication Closure were **PENDING**. The two independent OPEN Diagnostics follow-ups and Cross-Context Workspace Safety PENDING remained unchanged. This Documentation update was local until separately authorized for Push; a Documentation-only Push would again trigger Pages deployment.

## Subsequent Public HTTPS Human Browser Acceptance and Formal Publication Closure

On 2026-10-25 JST, Human reported **PASS for every requested public HTTPS item** and expressly approved **PUBLIC HTTPS HUMAN BROWSER ACCEPTANCE / PASS (BOUNDED)** for the published `0.2.3` application. The reported scope covers EN/JA Home basic presentation; Credits Version `0.2.3`, First release `2026-08-16`, and Updated `2026-10-25`; Credits opened from Home and Workspace; locale switching; Close, Escape, and Backdrop dismissal with focus restoration; and a representative D2-FIX1 path in which removal of title-only Metadata clears the obsolete warning while retaining the Entity. Human also reported no obvious Runtime Error or Dataset-protection regression in that review. This is Human-reported operation on public HTTPS, separate from the earlier local Human Browser Acceptance, CI tests, and HTTP/asset checks. Browser name, exact viewport, interaction recording, console audit, and exhaustive Dataset-safety testing are not inferred; Codex did not operate the public browser.

Human separately approved **LIAISONSCAPE 0.2.3 FORMAL PUBLICATION CLOSURE / HUMAN ACCEPTED / CLOSED (BOUNDED)** for application source `33732e8307579df6de00f8f89d5a19341f449abb`. The decision rests on the authorized four-commit Push, [successful CI and Pages deployment](https://github.com/sukoyaka-dopeness/e2r-liaison-scape/actions/runs/40183570153), public HTTP/asset verification, and the bounded public Human Browser report above. It closes this publication transaction within those reviewed bounds. It does not expand the separate D2 Formal Closure, accept all Dataset/Handoff/Workspace paths, all browsers or widths, or change Validator `0.7.0`, the Lighthouse JA warnings, LS-DA-PRESERVE2, or Dimension Assessment `0.2.0` non-Stable Candidate status. Operation-specific Diagnostics lifetime and candidate-dialog code/path presentation remain independent **OPEN** follow-ups; Cross-Context Workspace Safety remains **PENDING**. The existing `0.2.2` Publication Closure is unchanged.

This Human decision and its Documentation are local until a separately authorized Documentation Push. A LiaisonScape `main` Push of Documentation alone will run CI and Pages again; it will not change the `0.2.3` application source or create a new Application Release.

# LiaisonScape 0.2.2 release candidate preparation — 2026-10-25

Status at this preparation checkpoint: **LOCAL RELEASE METADATA ALIGNED / FINAL HUMAN BROWSER REVIEW PENDING / UNPUBLISHED**. Human approved `2026-10-25 JST` as the planned publication date after the initial date-pending checkpoint below. LiaisonScape `0.2.2` was subsequently published, received bounded public HTTPS Human Browser PASS, and was formally closed by Human within bounds; see the [publication and Human closure record](liaisonscape-0.2.2-publication-and-human-review-2026-10-25.md). The pending status here is historical.

## Scope and evidence

At this preparation checkpoint, the published application remained LiaisonScape `0.2.1`. The local Ko-fi Home candidate was committed as `a753108f2e631366422cad4ac8022ba3b6f68d59` after the [bounded Human Browser acceptance](home-kofi-human-browser-review-preparation-2026-10-24.md). That decision covers the five reported Home Ko-fi observations and does not become a new review of this release metadata. This candidate changed the application and private package version to `0.2.2`, and updated Credits version expectations in the existing EN/JA UI tests. It did not alter the accepted Ko-fi implementation or Dataset behavior.

At the initial preparation checkpoint, Credits `First release: 2026-08-16` remained historical and `Updated: 2026-10-21` still represented the last confirmed application publication date. That value was not a `0.2.2` publication date. The date decision and subsequent local metadata change are recorded below; the original checkpoint did not authorize publication.

## Publication gates

- Recheck the exact remote base, local HEAD, commit and file range, clean Index, and unrelated untracked work before authorizing an ordinary `origin/main` Push. A `main` Push runs tests, lint, build, and automatic GitHub Pages deployment through `.github/workflows/deploy-pages.yml`.
- Confirm that the actual JST publication date remains `2026-10-25` before Push; if it changes, align Credits, tests, and README and re-run tests, lint, and build. Confirm that `@sukoyaka-dopeness/e2r-validator` remains `0.7.0`; retain the two existing Lighthouse JA warnings and Diagnostics D2 OPEN. Dimension Assessment `0.2.0` remains a non-Stable Candidate. The bounded LS-DA-PRESERVE2 acceptance is unchanged.
- Ask Human to review the changed `0.2.2` Credits and final Updated date in EN/JA, and the release candidate in a safe browser context. The earlier 5/5 Ko-fi Home Human PASS remains its own bounded evidence; automated or Codex browser results do not substitute for the additional Human decision. This gate was subsequently completed for the final local candidate and followed by the bounded public review linked above.
- Obtain separate Human authorization for the exact Push range and the resulting Pages deployment. Verify the public application and workflow after publication. This local preparation is not publication acceptance, a new `0.2.2` release, or a closure of Dataset, Workspace, Handoff, or Validator follow-ups.

## Human-approved planned date and final local candidate — 2026-10-25 JST

Human approved `2026-10-25 JST` as the planned publication date for LiaisonScape `0.2.2`. The local EN/JA Credits are configured to show `Updated: 2026-10-25`, while `First release: 2026-08-16` and Version `0.2.2` are unchanged. The EN/JA Credits tests and README follow that planned value. This is release metadata for an **unpublished** candidate, not evidence of a completed deployment. If the actual publication occurs on another JST date, Human must revisit the date before Push.

The already accepted Ko-fi Home implementation and its bounded 5/5 Human Browser result remain separate from final metadata review. Human still needs to inspect EN/JA Credits Version and dates, Ko-fi display and destination, locale switching, Credits open/close/focus restoration, ordinary Home actions, and normal/narrow layouts on the final local candidate. No new Human Browser PASS, Push, Pages deployment, or publication closure follows from this metadata change.

After the date change, `npm test` passed 673/673 tests; `npm run lint`, `npm run build`, and `git diff --check` passed. The local review URL `http://127.0.0.1:4192/e2r-liaison-scape/` returned HTTP 200, and its served Credits source contained Version `0.2.2`, First release `2026-08-16`, and Updated `2026-10-25`. This checks source delivery, not rendered browser behavior. An isolated in-app browser was unavailable; Codex did not use the existing personal browser profile. Final Human Browser Review remains pending.

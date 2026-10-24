# LiaisonScape 0.2.2 release candidate preparation — 2026-10-25

Status: **LOCAL RELEASE CANDIDATE PREPARED / PUBLICATION DATE AND HUMAN REVIEW PENDING / UNPUBLISHED**.

## Scope and evidence

The published application remains LiaisonScape `0.2.1`. The local Ko-fi Home candidate was committed as `a753108f2e631366422cad4ac8022ba3b6f68d59` after the [bounded Human Browser acceptance](home-kofi-human-browser-review-preparation-2026-10-24.md). That decision covers the five reported Home Ko-fi observations and does not become a new review of this release metadata. This candidate changes the application and private package version to `0.2.2`, and updates Credits version expectations in the existing EN/JA UI tests. It does not alter the accepted Ko-fi implementation or Dataset behavior.

Credits `First release: 2026-08-16` remains historical. The local candidate retains `Updated: 2026-10-21`, the last confirmed application publication date. This is **not** the `0.2.2` publication date or a placeholder approved for publication. Before any Push, Human must confirm the actual JST publication date; the EN/JA Credits value, relevant tests, and README must then be aligned and verified in a separate bounded change. If the date changes before deployment, it must be checked again before Push.

## Publication gates

- Recheck the exact remote base, local HEAD, commit and file range, clean Index, and unrelated untracked work before authorizing an ordinary `origin/main` Push. A `main` Push runs tests, lint, build, and automatic GitHub Pages deployment through `.github/workflows/deploy-pages.yml`.
- Re-run tests, lint, and build after the final date change. Confirm that `@sukoyaka-dopeness/e2r-validator` remains `0.7.0`; retain the two existing Lighthouse JA warnings and Diagnostics D2 OPEN. Dimension Assessment `0.2.0` remains a non-Stable Candidate. The bounded LS-DA-PRESERVE2 acceptance is unchanged.
- Ask Human to review the changed `0.2.2` Credits and final Updated date in EN/JA, and the release candidate in a safe browser context. The earlier 5/5 Ko-fi Home Human PASS remains its own bounded evidence; automated or Codex browser results do not substitute for the additional Human decision.
- Obtain separate Human authorization for the exact Push range and the resulting Pages deployment. Verify the public application and workflow after publication. This local preparation is not publication acceptance, a new `0.2.2` release, or a closure of Dataset, Workspace, Handoff, or Validator follow-ups.

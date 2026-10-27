# LiaisonScape Public Beta 0.2.4 — local RC preparation

Date: 2026-10-28 JST

Current status: **PUBLISHED `0.2.4` / CI AND PAGES PASS / PUBLIC HTTPS TECHNICALLY VERIFIED (BOUNDED) / FORMAL PUBLICATION CLOSURE HUMAN ACCEPTED / CLOSED (BOUNDED)**.

Pre-deployment status snapshot: **VERSION 0.2.4 / RC HUMAN ACCEPTED (BOUNDED) / RELEASE DATE 2026-10-28 JST HUMAN-SELECTED / RELEASE AUTHORIZED**. Human formally accepted the bounded L3 RC and authorized its exact Manifest for Commit, Push, existing Pages deployment and bounded post-deployment verification. Publication verification is recorded separately below after deployment. The previous published application source was `33732e8307579df6de00f8f89d5a19341f449abb`; local parent before this release was `2cce17d4d154c26b97c0a053e40f727889ea17ab`.

## Scope and evidence

Human independently accepted the bounded [L3 Lighthouse Sample warning UX local candidate](l3-lighthouse-sample-warning-ux-local-candidate-2026-10-28.md#subsequent-formal-human-decision--2026-10-28-jst) on 2026-10-28 JST. The [cross-app RC readiness audit](../../e2r-spec/docs/cross-app/cross-app-sample-dataset-warning-ux-rc-readiness-audit-2026-10-28.md) identified nine app paths. The current RC scope is those nine paths plus seven release-preparation paths below. NarrativeLine's RC and publication decisions remain independent. The earlier Human Browser Review, automated tests and metadata preparation are separate evidence. Human formally accepted this bounded 16-path RC on 2026-10-28 JST; this does not extend the earlier L3 feature acceptance bounds.

| Group | Exact local RC paths |
| --- | --- |
| Accepted implementation and test (9) | `src/App.tsx`; `src/components/DatasetReplacementDialog.tsx`; `src/styles.css`; `tests/appUiIntegration.test.ts`; `src/components/SampleExtensionNotice.tsx`; `src/known-sample-extension-notice.ts`; `src/reviewed-sample-payloads.ts`; `tests/knownSampleExtensionNotice.test.ts`; `docs/l3-lighthouse-sample-warning-ux-local-candidate-2026-10-28.md` |
| Version and publication preparation (7) | `package.json`; `package-lock.json`; `src/components/CreditsDialog.tsx`; `docs/user-guide-en.md`; `docs/user-guide-ja.md`; `README.md`; this RC record |

**Accepted RC manifest: 16 exact paths**, including implementation/test/record files. The Credits expectation changes share `tests/appUiIntegration.test.ts`, already counted in the accepted nine. The unrelated untracked `.tmp-normal-offset-output.json`, `.tmp-reference-layout-regression1.json`, and `experimental/product-evaluation-seam/spacing-inspection2/` remain excluded and preserved. E2R-SPEC's Roadmap/audit, other repositories, generated build output and disposable browser data are outside this app commit.

## Release identity

`package.json` and the root `package-lock.json` identify `0.2.4`; dependencies, including published Validator `0.7.0`, are unchanged. EN/JA Credits display LiaisonScape `0.2.4`, preserve First release `2026-08-16`, and now show the Human-selected Updated date `2026-10-28`. The EN/JA Credits tests match. The date selection is not publication evidence; deployment must be verified independently.

EN/JA User Guides explain the official Lighthouse-only Additional information, limited JA graph-edit/Export preservation evidence, exact technical details, Current/Candidate separation and independent failure notices. README identifies the accepted `0.2.4` release and points here for scope and publication evidence. Earlier `0.2.2` and `0.2.3` publication/acceptance records remain historical and unchanged. This record distinguishes RC acceptance from deployment verification and formal Publication Closure.

## Safety, verification and decision boundary

The accepted Runtime diff is limited to known official-sample informational recognition, compact disclosure, Candidate/Current presentation and bounded focus adjustment. Validator Code/Severity/Path remain available; matching an ID/version is not semantic validation. There is no change to Dataset persistence, graph-edit, Export, replacement algorithms, public sample JSON, schema, Core or Extensions. Unknown/changed data and operation failures do not receive the known-sample assurance. The existing `0.2.3` Publication Closure remains in force for its own source only.

This paragraph records the pre-acceptance release checkpoint. Final local verification, CI, Pages deployment, and served-HTTPS evidence are recorded in the release verification section below. The initial unchanged experimental `initial-layout-provider.test.ts` failure under a 100ms budget, subsequent focused 7/7 PASS, and full rerun 679/679 PASS remain part of the verification history; the timing-sensitive test remains a CI risk. The existing Pages workflow runs `npm ci`, tests, lint, build and Pages deployment on `main` push; its definition was not changed. Automated/source results are distinct from Human Browser evidence. The exact 16-path RC was accepted within its stated bounds. At that checkpoint, Formal Publication Closure remained a separate Human decision.

The pre-acceptance residual exclusions include arbitrary or modified Extension payloads; mismatched declaration/version and mixed diagnostics; all edit/save/Export preservation paths; semantic Dimension Assessment validation; untested browsers, viewports and accessibility settings; and broader Cross-Context Workspace Safety. No new release blocker was confirmed in the bounded accepted feature scope. These exclusions remain independent follow-ups; they are not resolved by RC or Publication Closure.

## Post-deployment verification — 2026-10-28 JST

The accepted release source commit `4fe9c1b77dc231bbd5dbd21d42cafcfbd8239d17` (parent `2cce17d4d154c26b97c0a053e40f727889ea17ab`) was pushed to `main`. The [GitHub Actions run](https://github.com/sukoyaka-dopeness/e2r-liaison-scape/actions/runs/40562575523) completed successfully, including tests, lint, build, artifact upload and Pages deployment. The remote `main` ref matched the release source SHA at verification.

The public app at <https://sukoyaka-dopeness.github.io/e2r-liaison-scape/> returned HTTP 200. Its served JavaScript `assets/index-BuwK2SMK.js`, CSS `assets/index-GGhgA3M3.css`, worker `assets/worker-DBo3pt8N.js`, and layout worker `assets/explicit-auto-layout-worker-Dj6-46DM.js` matched the local release build byte-for-byte by SHA-256: `0DC168C4722EE30438C794115EEDB0C84B23EBCBE54ADAC9BB53627B78EE97C9`, `46BB4AD207363553C29E7B3CDF4FC37564B21E6CF0BE229B5463DD7669572B62`, `678D2CF40DD84F61CEEB30CF07FAACD19766AB08099643949F28A1E65436C850`, and `18689D5AD1F2B95F59AF52495079E7EFF7DFF9C60F474BE132C7CD76759C9B22`, respectively. The app markup identifies LiaisonScape, and the matched JavaScript is built from the source that labels Credits as `0.2.4`, First release `2026-08-16`, Updated `2026-10-28`. EN/JA User Guide files at the release commit each returned HTTP 200 from the public repository.

At the time of this deployment-verification checkpoint, no Codex browser interaction or new public Human Browser Acceptance had been performed. Earlier Human Browser acceptance applies to the bounded local L3 candidate and does not become a new public-environment smoke test. These results are technical deployment verification, not themselves Formal Publication Closure; the subsequent Human closure is recorded below. The initial unchanged experimental layout-provider timing failure remains recorded above as a CI risk; the final local suite and this release workflow both passed.

## Formal Publication Closure — Human accepted 2026-10-28 JST

Human formally accepted LiaisonScape Public Beta `0.2.4` as **PUBLICATION DEPLOYED / PUBLIC HTTPS TECHNICALLY VERIFIED (BOUNDED) / HUMAN ACCEPTED / CLOSED (BOUNDED)**. This decision is based on the bounded RC acceptance, successful CI and Pages deployment, the public HTTPS and release-asset checks above, and the Human's explicit Closure decision. Release source commit: `4fe9c1b77dc231bbd5dbd21d42cafcfbd8239d17`. The verification-record synchronization is commit `655f2930a2d51bc1c3647622fa606b77d6444989`.

No new public Human Browser review was performed. The previously reported Human Browser review applies to the bounded local L3 candidate; automated tests, GitHub Actions/Pages, HTTPS/asset verification, and Human Browser evidence remain separate classes. This Closure does not certify browser interactions on the public deployment or expand the accepted scope to arbitrary payloads, failure paths, all editing/persistence/export flows, or broad Cross-Context Workspace Safety.

Independent follow-ups remain open: Validator `0.7.0` recognition limits and semantic Dimension Assessment validation; unknown or modified Extension payloads; mismatched declarations and mixed diagnostics; failures and preservation across untested editing, save, and Export paths; broader Cross-Context Workspace Safety; the unchanged experimental Layout Provider's timing-sensitive test risk; and the observed React/DOM test-harness `attachEvent`/`detachEvent` error output. These remain risks or unknowns, not resolved failures. Existing LiaisonScape `0.2.3` Publication Closure remains unchanged.

# LiaisonScape Locale Conflict focus and button geometry

Date: 2026-11-07 JST
Status: LOCAL CANDIDATE / AUTOMATED VERIFICATION PASS / HUMAN ACCEPTANCE PENDING.
No Commit, Push, Deployment or Publication Closure.

## Authority, baseline and scope

Human explicitly authorized this local implementation on 2026-11-07. This is a
new focus/geometry refinement on top of the dirty Visual Refinement candidate,
not an expansion of the earlier Implementation Acceptance or public verification.
The reported Desktop Work measurements are Human-provided evidence: NL/LS choice
buttons 67.03 x 36px at Desktop and 360px; PP 80.44 x 40.09px and 74.17 x 37.20px.
Those values were not independently measured by this Codex run.

The prior local native-button geometry direction is refined by the new explicit
cross-app geometry decision: keep NL/LS ordinary compact action geometry and
apply that same geometry to PP Locale choices only. Earlier records are retained.
Heading semantics are settled: the two bilingual lines form one heading.
Its 20px/500/1.5 typography is unchanged and not reopened.

Owned implementation/tests:
- src/components/LocaleConflictDialog.tsx
- src/styles.css
- tests/locale-conflict-dialog.test.ts
- tests/appUiIntegration.test.ts
This new record is the only documentation written in this task for this repo.

## Focus restoration

Resolution is marked by the local dialog. Only after that dialog unmounts does a next-frame callback focus header a.app-brand with preventScroll. Existing initial focus, Tab trap and Escape/backdrop handlers stay intact.

NL/LS do not schedule restoration merely on mount or unrelated unmount. Their
cleanup only restores after a resolution action. A subsequent dialog, including
a Handoff/replacement safety dialog, retains modal focus rather than having focus
stolen by the brand callback. No Handoff start order or Dataset operation changes.
The destination is the app-name anchor, not the header language switch or BODY.

## Common scoped button geometry

| Property | Local design |
| --- | --- |
| Font | system-ui, Segoe UI, Roboto, sans-serif; 15px; weight 400 |
| Line height / letter spacing | 18px / normal |
| Minimum height | 36px; no fixed height, allowing text/zoom growth |
| Padding | 5px vertical, 9px horizontal |
| Border | 1px solid; retain app colors |
| Radius | 4px |
| Action gap | 8px |
| Width method | content-sized grid; two equal minmax(0,1fr) columns; max-width 100% |
| Alignment | action group right aligned; centered button text |
| Narrow fit | min-width 0, normal wrapping, overflow-wrap anywhere |

No fixed pixel button width is imposed: the common font, border, padding and
content-sized equal-column method determine it. Approximately 67px is a prior
reference, not a new rendered measurement or guaranteed width across platforms.
Focus outlines and colors continue to use each app's existing accent rules.
These changes affect only Locale Conflict action-group and button selectors.
Ordinary dialogs are byte-identical outside those scoped selectors. PP ordinary
confirmation actions intentionally retain their previous larger geometry; they
are not globally shrunk to achieve this authorized Locale-only consistency.

## Verification and limitations

681 tests, lint, build PASS. New DOM regression exercises both saved languages and English/Japanese/Escape/backdrop with delayed removal and StrictMode; Tab boundaries are checked. Production App integration verifies brand focus after both choices and both conflict directions while saved Locale remains unchanged.

Source comparison PASS: the full stylesheets reconstruct their task baseline
exactly after replacing only the two changed local selectors. Button geometry
properties are identical across all three apps. Heading rules, NarrativeLine's
Home maximum-width candidate, ordinary modals and all other CSS are unchanged.

The first NarrativeLine full run failed because one existing jsdom Handoff test
did not provide requestAnimationFrame for the new post-commit cleanup. The test
scheduler was supplied and focus asserted; its focused test and the subsequent
full 412-test run pass. The failed log is retained beside the recheck log.
LiaisonScape's existing jsdom detachEvent warnings remain (38 occurrences in both
prior and current full logs); all tests pass. These warnings are not reported as
production Runtime exceptions, nor does a passing jsdom run prove their absence
in a real browser.

No Browser Use recovery, independent CDP or native browser automation was attempted.
The known VS Code Browser Access Host blocker is outside this task. Current native
Enter/Space activation, post-commit timing, actual button rectangles, rendering,
focus rings, clipping/overflow and Runtime exceptions are NOT VERIFIED here.
Source/jsdom checks are not new official Browser Use PASS. Screen-reader speech,
other-engine coverage and all edit/save-failure states remain NOT VERIFIED.

## Preserved contracts and Desktop Work acceptance checks

Conflict detection, saved-background Locale, initial saved-button focus,
English-before-Japanese, lang/name/description/role, temporary resolution,
non-persistence, reload behavior, native button semantics and Tab trapping remain.
The Header continues to label the destination language. No Core/Extension,
Dataset/Workspace, Home-to-Hub, import/export or Handoff contract is changed.

In connected isolated Desktop Work, recheck both conflict directions, both choices,
Escape/backdrop, Tab/Shift+Tab and native Enter/Space; brand focus after closure;
saved preference non-change and same-tab reload; Handoff ordering and any successor
dialog retaining focus. Measure actual innerWidth and both choice rectangles at
1280/360-or-390/320px; inspect equal widths/right alignment, typography, focus ring,
zoom/wrapping/overflow and console errors. Compare an ordinary confirmation modal
to rule out style spillover. These are pending checks, not Human Acceptance.

## Evidence and preservation

Workspace evidence: workspace/diagnostics/locale-focus-geometry-2026-11-07/ holds
the starting dirty-file hashes/HEAD/status, original stylesheets and component
snapshot, geometry-scope-check.json and full gate logs. The three old Locale
publication records and Home-to-Hub addenda are untouched. Existing untracked
Home records/tests and LiaisonScape diagnostic files are preserved.

Applied Accepted knowledge: accepted-dirty-worktree-baseline-recovery for exact
ownership and preservation; application-modularization-and-incremental-extraction
for dialog-local responsibility; bounded-public-release-evidence-reconciliation
for separating source/tests, Human-provided measurements, new Browser Use evidence
and formal acceptance/publication. None adds authority for Commit or publication.


## A ? Bounded Human Acceptance, 2026-11-07

Current bounded authority: HUMAN ACCEPTED / LOCAL COMMIT AUTHORIZED ONLY.
This dated section supersedes earlier pending-acceptance statements for this
Visual Refinement. Earlier status lines, BLOCKED attempts, NOT VERIFIED scopes,
Implementation Acceptance and publication history remain their original snapshots.

The Human explicitly accepts LiaisonScape's latest local Locale Conflict Dialog
Visual Refinement: one bilingual heading with 20px/500/1.5 typography; English then
Japanese; equal, right-aligned choice buttons with common 15px/400 font, 18px line
height, minimum 36px height, 5px/9px padding, 1px border, 4px radius and 8px gap;
normal closure to the app-name link after either choice, Escape or backdrop;
both saved/requested Locale conflict directions, keyboard/focus cycling, temporary
session resolution with saved-language preservation, Desktop/Narrow/320px display,
and the accessibility structure actually checked. No third-language design,
Header selector semantics, Locale, Dataset or Handoff contract is changed.

### Independent evidence adopted by the Human

1. VS Code Codex implementation and automated evidence: 681 tests PASS; lint/build PASS.
   Gate logs are retained in workspace/diagnostics/locale-focus-geometry-2026-11-07/.
   Those gates are reused: the accepted source/test bytes still match the baseline
   from the subsequent successful local-server restoration. This commit task does
   not rerun the full gates or modify Runtime/tests.
2. Desktop Work official Browser Use, as reported by the Human: Google Chrome /
   extension, dedicated profile E2R Browser Test created by the Human; connection
   disappearance/reappearance was correlated with that dedicated environment.
   Latest post-fix checks PASS for both conflict directions, both choices and
   dismiss routes, settled brand focus, about 67.03 x 36px choice buttons and common
   computed geometry, 1280/360/320px, Tab/Shift+Tab/Enter/Space, temporary/reload
   behavior, role/name/description/lang, and no observed clipping, overlap,
   horizontal overflow or Runtime warnings/errors in that scope. Transient BODY
   focus before the NL/LS render settles is distinct from the old persistent BODY
   regression. This is reported Desktop Work evidence, not a new VS Code browser
   run and not independent CDP evidence.
3. Human-operated visual evidence: cross-app comparison, including the reported
   12-screen locale/direction/Desktop-Narrow review and Desktop/320px confirmation.
   The Human accepts the visual consistency and observed operation results;
   this does not attribute every agent browser operation to the Human.
4. Local-source/serving evidence: successful restoration served each owning
   Repository on the requested 4195/4196/4197 URLs. App titles and HTTP 200 matched;
   relevant CSS/text and Vite embedded original sources matched current files,
   after BOM/line-ending normalization where applicable. Source/test hashes were
   rechecked against that restoration baseline before this acceptance record.
   This is scoped matching, not proof for every dependency or a new browser test.
5. The explicit 2026-11-07 Human instruction is the formal acceptance decision;
   none of the automatic or browser evidence grants acceptance by itself.

### Explicit exclusions and retained work

NOT VERIFIED / excluded from this acceptance: official Browser Use focus contention
when a subsequent Handoff confirmation opens; actual screen-reader speech;
direct saved-Locale value comparison inside the real browser; and complete
source/serving identity of every dependency. Existing focus guards and automated
preference-value assertions are supporting evidence only, not missing native
browser PASS. Comprehensive engines and all editing/save-failure states also
receive no expanded acceptance. No Home layout change in this Repository is accepted or introduced by A.

Existing mixed public addenda in docs/locale-conflict-bilingual-ui-2026-11-05.md
and docs/home-to-hub-navigation-2026-11-04.md stay outside this commit and remain
byte-preserved in the dirty worktree. LiaisonScape diagnostic items and other
unrelated work are excluded and preserved. No e2r-spec or ai-knowledge changes.

### Accepted source/test fingerprint (before Git line-ending normalization)

| Path | SHA-256 |
| --- | --- |
| src/components/LocaleConflictDialog.tsx | 48fd5769f33abaceee8b69bc1e7f046ca5f6c968eba9e5fb314e8c5c56323762 |
| src/styles.css | d6853a34797b73a576fdabe1315b7fd3d064c2ec086e30f6f5b7e55ce72d7de0 |
| tests/appUiIntegration.test.ts | 6fa297283143350614e62ed29eb8f41b01a83235a5bd3fb45e52024e6ba18c32 |
| tests/locale-conflict-dialog.test.ts | dd96fd0134d386a044224f265cdb4592ed5b56d34ac706fc080aba8286ae2a0a |

Local Commit is explicitly authorized for this bounded implementation, direct
tests and owned evidence records only. Actual commit identity is supplied by Git
and the completion report; it is not claimed before commit creation. Push,
Deployment and Publication Closure are NOT AUTHORIZED and remain unperformed.
Neither this acceptance nor the Local Commit closes Home-to-Hub or any previous
publication workstream. Any later public operation needs separate Human approval.

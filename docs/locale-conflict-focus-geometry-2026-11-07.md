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


## Publication evidence synchronization - 2026-11-12

Current status: BOUNDED LOCAL HUMAN ACCEPTANCE / PUSH AND PAGES SUCCESS /
OFFICIAL PUBLIC BROWSER VERIFICATION BLOCKED / HUMAN PUBLICATION ACCEPTANCE
AND PUBLICATION CLOSURE PENDING. The earlier statement that Push was not yet
authorized and had not occurred is retained above as its original checkpoint.

Human subsequently authorized publication of the accepted commit
`81c7214aa800479d7ecf7ffc1eb9b5254e735467`. The commit was normally pushed to main; GitHub Pages
[workflow 42352566751](https://github.com/sukoyaka-dopeness/e2r-liaison-scape/actions/runs/42352566751)
completed SUCCESS for that exact SHA, including 681 tests, lint and build. The remote main
SHA was read again on 2026-11-12 and matched. The public URL is https://sukoyaka-dopeness.github.io/e2r-liaison-scape/

The bounded post-deployment technical check returned HTTP 200 and the public main JS/CSS assets matched the accepted local build byte-for-byte and the CI build output names.
This establishes scoped publication evidence, not full dependency equivalence
or UI operation. The earlier local Human Acceptance, local automated gates,
Desktop Work local-candidate browser evidence and this public technical evidence
are distinct.

The requested official post-deployment Public Browser Acceptance verification
has not completed. The 2026-11-07 attempt was blocked before browser detection
by a Node runtime path error; the 2026-11-11 VS Code retry returned
`The browser access host is unavailable`. These are separate observations;
no universal cause or product defect is asserted. Existing prior browser PASS
was not converted into post-deployment PASS. Human Publication Acceptance and
Publication Closure are not established by this synchronization.

Still NOT VERIFIED: actual screen-reader speech; direct real-browser comparison
of saved Locale values; successor Handoff confirmation focus contention; and
complete deployed dependency identity. Existing automated preference tests and
focus guards are supporting evidence only. Other browser engines and all
edit/save-failure states remain outside this bounded acceptance.

This section is a local Documentation-only addendum. It does not authorize or
perform a new Commit, Push, Deployment, acceptance, or closure, and does not
change Core, Extension, Dataset, Locale or Handoff semantics.


## Public browser evidence and audit - 2026-11-12

The preceding synchronization is a historical checkpoint. On 2026-11-12,
an isolated Chrome headless profile and disposable browser contexts were used
for independent CDP testing of the three public HTTPS applications. This is
real-browser evidence, not official Browser Use recovery or Human review. The
previous Browser Use BLOCKED history remains valid: the access host was
unavailable. Publication Acceptance and Closure remain Human decisions.

The subsequent evidence audit checked 96 unique cases: three apps, saved EN/JA,
1280/390/360/320px, and English/Japanese/Escape/backdrop actions (32 per app).
Within that scope, bilingual content, button order, initial focus, Tab/Shift+Tab,
Enter/Space, focus return to each app-name link, selected display language,
unchanged saved Locale values and reload continuity passed. CDP captured no
Runtime.exceptionThrown in these cases; this is not an exhaustive console-warning
or all-path error audit. Direct saved-Locale comparison, previously excluded
from local acceptance, is now supported for these isolated public cases only.

DOM geometry measurements covered three apps at 1280/360/320px. Dialog buttons
measured approximately 67.03 by 36px with the accepted heading styling and no
measured horizontal overflow. Home measurements were in English: all three
were 320px at 1280 and 360, and NarrativeLine was 286px versus 288px for the
other two at 320. Human accepted the 2px difference on 2026-11-07. The audit
reconstructed 96 unique cases and nine geometry measurements from the local
`workspace/diagnostics/public-visual-review-20261112/` result JSON and scripts.
The results do not record asset hashes or a Git SHA; previous deployment and
sampled asset checks establish only a bounded revision association, not complete
identity.

Actual screen-reader speech, successor Handoff-dialog focus contention, other
browser engines, all editing/save-failure states and full delivered dependency
identity remain NOT VERIFIED. This addendum does not change the 2026-11-07 local
Human Acceptance, grant product-wide assurance, or establish Public Browser
Acceptance, Publication Acceptance or Closure. Human review remains pending.

## Human Publication Acceptance and Closure - 2026-11-12

**PUBLICATION ACCEPTANCE APPROVED (BOUNDED) / PUBLICATION CLOSURE APPROVED
(BOUNDED).** The Human explicitly adopted the preceding isolated public
Chrome/CDP evidence for the Locale Conflict Dialog visual refinement in
NarrativeLine, LiaisonScape and ParameterPlotter, and separately for the
NarrativeLine Home action-width refinement. The closure covers exactly those
two workstreams, their accepted implementation, publication and bounded
verification. The Home decision is also recorded in
[its own record](../../e2r-narrative-line/docs/home-action-width-visual-refinement-2026-11-06.md).

The Human adopted the Codex-operated 96-case public evidence, saved-Locale
comparisons and nine English Home geometry measurements, together with prior
local acceptance and publication evidence. This is not a claim that the Human
personally performed those 96 browser cases. The previously accepted 286px
versus 288px difference at 320px remains acceptable. The 2026-11-07 bounded
local Human Acceptance remains distinct and unchanged.

Official Browser Use remains BLOCKED independently; CDP did not restore it.
Actual screen-reader speech, successor Handoff-dialog focus contention, other
browser engines, all edit/save-failure states, complete delivered dependency
identity, unobserved console warnings and Runtime paths, and Cross-Context
Workspace Safety as a whole remain outside this closure. They are not thereby
declared FAIL or new publication blockers. This decision does not close
Home-to-Hub, other releases, untested functionality or the entire product.

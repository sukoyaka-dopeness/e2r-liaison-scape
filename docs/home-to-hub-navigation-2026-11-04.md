# Home-to-Hub navigation — local implementation

Date: 2026-11-04 JST

Status: PUBLISHED / FINAL PUBLIC E2E PASS (BOUNDED) / HUMAN PUBLICATION CLOSURE APPROVED (BOUNDED)

Only the Home branch receives a separate ecosystem navigation group after
`home-guides` and before `home-support`. Its native anchor sends the current
`locale` to the public Hub, uses the approved JA/EN labels and explicit safe
new-tab attributes, and explains the new tab in its localized accessible name
and title. Its `.86rem` normal-weight type matches neighboring secondary links.
Workspace, Graph, Detail, Header/Footer/Credits and replacement safety are unchanged.

679 tests, lint and build passed, with the previously documented non-failing
React/jsdom input-polyfill diagnostics. Existing Home DOM coverage now checks
both locale hrefs, labels, accessibility and group ordering. Isolated Edge
checked EN/JA at 1280x900, 390x844 and 320x640, typography parity and overflow,
new-tab/null-opener behavior, and unchanged source Home/serialized Dataset keys.
The public destination and local unpublished Hub receiver were checked as
separate steps. No Dataset operation was invoked.

The [workspace verification record](../../e2r-hub/docs/home-to-hub-navigation-2026-11-04.md)
contains shared evidence and limits. Three pre-existing untracked diagnostic
paths were preserved. No existing acceptance is expanded. Manual screen-reader
and active-edit browser review remain unperformed. No Commit, Push or Deployment.

## Final acceptance preparation — 2026-11-04

The current scoped source diff was rechecked; runtime and tests were not edited.
Fresh selected Home/link, local Import failure and EN/JA Credits tests passed
4/4. The prior 679-test and lint/build evidence remains separately recorded for
the unchanged candidate. Current implementation/tests/manifests are SHA-256-bound
in the shared diagnostic evidence. Native Edge Tab/Shift+Tab, visible focus,
Enter new-tab/null-opener behavior, accessibility-tree name/new-tab notice and
Credits trapping/Escape/focus return passed in EN/JA at 1280x900 and 390x844.
A clean synthetic Dataset imported through Home retained its Home/storage state
after Hub navigation and returned identical Workspace text through Continue.

No native-browser exception or material blocker was found in this scope.
Screen-reader speech, pending edits/degraded saving, exhaustive warnings and
public four-app end-to-end remain unverified. Human Acceptance and acceptance
of those limits remain pending. The three pre-existing untracked diagnostic
paths remain preserved; no source or unrelated cleanup was performed. Use the
shared record's URLs/checklist for review. No Commit, Push or Deployment.

## Bounded Human Acceptance and sequential publication authorization — 2026-11-04

The Human explicitly accepted this bounded Home-to-Hub candidate using the
recorded automated tests, lint/build and Codex-operated isolated Edge evidence.
This does not claim that the Human performed every browser operation, nor does
it expand acceptance or release decisions for other features. Earlier pending
acceptance statements above describe the preparation snapshot and are superseded
only within this bounded scope.

Accepted: normal-Home link placement after Guide and before support, secondary
link typography, EN/JA, safe new-tab navigation, locale-only transfer with no
Dataset transfer/change, and ParameterPlotter's non-owner boundary; Hub startup
locale reception, manual UI/URL synchronization, reload persistence, no history
growth, top navigation and startup-only Back/Forward behavior.

NOT VERIFIED at acceptance: actual screen-reader speech, all pending-edit and
save-failure states, exhaustive browser engines, and public four-app end-to-end.
These are accepted evidence limits, not PASS results. Public evidence must be
measured separately after deployment. Publication Closure remains a separate,
explicit Human decision even if technical public checks pass.

The Human authorized exactly 17 candidate paths: Hub 5 and each app 4, including
this existing record. Exclude Hub's separate Dataset Workflow publication
addendum, LiaisonScape's three pre-existing untracked diagnostic paths, and all
unrelated work. Each repository receives an independent commit and ordinary
main push using the existing Pages workflow. Order: Hub, NarrativeLine,
LiaisonScape, ParameterPlotter. Each preceding deployment and public check must
PASS before the next push. Stop for unexpected scope, history, gate, deployment
or public regression; no force push or history rewrite is authorized.

Publication has not yet been verified at this checkpoint. Later measured
publication results will be recorded locally without an automatic extra push.

### Fresh publication preflight

Current full repository checks passed on 2026-11-04: tests, available lint (or
ParameterPlotter syntax check), and build. The implementation/test/dependency
SHA-256 manifest matches the final candidate; no runtime change was introduced
during acceptance recording. See isolated publication diagnostic logs for output.

## Phase C publication STOP — 2026-11-04 (local addendum)

Bounded acceptance and exactly four paths were committed as
`e75f79de38795e941dd0097128f7ac857adbfdff`: App.tsx, styles.css,
appUiIntegration.test.ts and this record. Hub and NarrativeLine deployments and
public checks passed before Phase C. Fresh 679 tests, lint and build passed.

Ordinary push first failed with Empty reply from server. Remote main was read
back unchanged; one retry of the same SHA was rejected by GitHub Internal Server
Error, request ED42:2160A3:7FFC16:BA65DE at 2026-11-04T11:10:06Z. Git and API
readback still show `5e010a77b3a1bc4f390559e30880588633f1a125`; there is no Pages
run for the candidate SHA. Push FAIL; candidate Deployment NOT STARTED; public
new Home-to-Hub EN/JA NOT VERIFIED. Public URL remains:
https://sukoyaka-dopeness.github.io/e2r-liaison-scape/

No force push, workflow change or later publication phase was attempted.
ParameterPlotter publication and final four-app E2E are held. The existing
published Hub can still launch the existing LiaisonScape Home in EN/JA; that is
separate evidence and does not verify this unpublished Home link. All three
pre-existing untracked diagnostic items were preserved (underlying hashes checked).

This stop/result addendum is local and uncommitted; the accepted candidate commit
remains unpushed. The shared Hub record contains evidence and remaining limits.
Human Publication Closure is pending; no screen-reader/all-edit-state PASS claim.

## Phase C resumed successfully and final public E2E — 2026-11-04

The Human authorized retrying the same existing commit and continuing Phase D
only after Phase C public PASS. At resume, all four remote main SHAs matched the
prior snapshot. `5e010a77b3a1bc4f390559e30880588633f1a125` was confirmed an ancestor
of `e75f79de38795e941dd0097128f7ac857adbfdff`. Its contents remained exactly the
four approved paths; source/test/dependency hashes matched the accepted candidate.
The existing dirty stop addendum and three diagnostic items were not staged.

Ordinary fast-forward Push SUCCEEDED for the unchanged commit
`e75f79de38795e941dd0097128f7ac857adbfdff`; remote main matched. [Pages run
41820884504](https://github.com/sukoyaka-dopeness/e2r-liaison-scape/actions/runs/41820884504)
completed SUCCESS for that SHA (tests, lint, build, deploy). Actual public Home:
https://sukoyaka-dopeness.github.io/e2r-liaison-scape/
EN/JA at measured 1280/390px passed link wording/order, typography parity,
no horizontal overflow, new-tab/null-opener behavior, public Hub locale reception,
top/manual switching and unchanged source Home/serialized Dataset keys. Screenshots
were inspected. Public index-DU2oLeOP.js matched the exact-SHA build log. Phase D
started only after this public PASS. The earlier failed push attempts above are
preserved historical evidence; their underlying server-error cause is unknown.

ParameterPlotter then committed exactly its four approved paths as
`1afa30613efc443352ca1a19cf5d94f2273ff7c6`, pushed normally and passed [Pages
41821372129](https://github.com/sukoyaka-dopeness/e2r-parameter-plotter/actions/runs/41821372129)
and [Check 41821371846](https://github.com/sukoyaka-dopeness/e2r-parameter-plotter/actions/runs/41821371846).
Its actual public EN/JA Home-to-Hub checks passed at measured 1280/390px, and
non-owner screens had no Hub group in all four combinations. Public home-screen.js
and home-screen.css matched that commit's contents after newline normalization.

### Final public matrix after all four deployments

All following results are fresh Codex-operated Edge 156 browser measurements
against actual public URLs, in disposable isolated Contexts. No local receiver
redirect was used and no personal browser or user Dataset was touched.

| Source Home | EN to Hub | JA to Hub | Effective viewport widths |
| --- | --- | --- | --- |
| NarrativeLine | PASS | PASS | 1280 and 390px |
| LiaisonScape | PASS | PASS | 1280 and 390px |
| ParameterPlotter | PASS | PASS | 1280 and 390px |

Twelve Home views passed exact link copy/attributes, placement and computed
secondary font parity, no overflow, native Enter new-tab navigation, null opener,
receiver initial locale, source Home/URL/serialized Dataset preservation and no
observed application exception. ParameterPlotter's second-tab non-owner boundary
also passed EN/JA at both widths, without acquisition/takeover.

A clean synthetic fixture (one Entity, one Event, one Relation, names prefixed
NAV-ACCEPTANCE) was imported only into each disposable public test Context. Six
app/language round trips passed: open fixture, return Home, open public Hub with
locale only, compare unchanged Home and stored Dataset, Continue/Return to
Workspace and compare identical Workspace text. These checks do not cover all
pending edits, replacement failures or save-error states.

Public Hub's four EN/JA/width chains passed startup reception, manual UI/URL
sync, reload both ways, no added history entry, top click/keyboard, Back/Forward
startup-only behavior, legacy/invalid/duplicate handling, Credits keyboard return
and no fetch of an ignored Dataset URL. Six actual public Hub-to-app new-tab
launches passed EN/JA and the expected Home; all three cards remained solid and
available. Desktop/Narrow screenshots were inspected; no material display or
application-runtime regression was observed in this bounded scope.

Current published source SHAs: Hub `30d9393725aef87194c0ccba544c8d1148ee958a`,
NarrativeLine `e85c5d6802c862708e17918572413194f3af9a6f`, LiaisonScape
`e75f79de38795e941dd0097128f7ac857adbfdff`, ParameterPlotter
`1afa30613efc443352ca1a19cf5d94f2273ff7c6`; final remote reads matched.

Evidence: workspace/diagnostics/home-to-hub-2026-11-04/resume-publication-summary.json,
resume-public-e2e-all-results.json, resume-public-dataset-results.json,
resume-public-hub-locale-results.json, resume-public-hub-launch-results.json,
corresponding scripts/screenshots and exact-SHA deployment logs/results. An early
reverse-launch diagnostic queried a document root before it existed; optional
root guarding corrected the diagnostic, and the rerun passed. This was not an
application-source change or a product-runtime failure.

Preservation: Hub/NarrativeLine's existing local publication records stayed
byte-identical during resume; Hub's separate publication addendum and all three
LiaisonScape diagnostic items matched their prior SHA-256 hashes. There was no
extra Hub/NarrativeLine push, new runtime edit, schema/contract/Handoff change,
workflow change, force push, reset or history rewrite. Pages emitted non-failing
actions/runtime-image deprecation notices; no workflow change was made.

Knowledge: accepted-dirty-worktree-baseline-recovery scoped exact-path ownership,
Candidate fingerprints and dirty/untracked preservation. The bounded-public-release
evidence playbook scoped source/workflow/public observation/Human-decision
separation; it did not introduce new release gates. Workspace placement and Edge
CDP diagnostic guidance applied only to isolated workspace diagnostics.

PUBLIC E2E PASS (BOUNDED). Human Publication Closure remains PENDING. Actual
screen-reader speech, all pending-edit/save-failure states and exhaustive browser
engines remain NOT VERIFIED under the accepted limits. No claim is made that the
Human performed these browser operations or accepted other product releases.
This new result addendum remains LOCAL/UNCOMMITTED; no second documentation push
was performed. Any publication of these final records is a separate operation.


## Bounded Publication Closure — 2026-11-12 JST

Human confirmed the new-tab route to Hub and approved bounded Home-to-Hub
Publication Closure. Earlier candidate Acceptance and the Codex-operated public
matrix above remain distinct evidence; Human did not claim to perform every
matrix or synthetic Dataset check personally.

**CLOSED (BOUNDED).** Screen-reader speech, pending-edit and replacement/save-failure
states, exhaustive engines and full Dataset byte identity remain unverified. The
earlier push failure remains historical evidence. The separate diagnostic files,
routing-preview Worktree and dirty Locale record are outside this Closure and
remain untouched.

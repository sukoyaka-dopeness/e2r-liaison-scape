# Home-to-Hub navigation — local implementation

Date: 2026-11-04 JST

Status: BOUNDED HUMAN ACCEPTANCE RECORDED / SEQUENTIAL PUBLICATION AUTHORIZED / PUBLICATION AND HUMAN CLOSURE PENDING

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

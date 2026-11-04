# Bilingual Locale Conflict Dialog — local implementation

Human design decision: 2026-11-04. Implementation and verification: 2026-11-05 JST.

Status: BOUNDED HUMAN IMPLEMENTATION ACCEPTANCE RECORDED / NO COMMIT, PUSH OR DEPLOYMENT.

## Human-adopted UI

The Human selected the same visible question in all three recipient apps:

- English (`lang=en`): Which language would you like to use?
- Japanese (`lang=ja`): どちらの言語で表示しますか？

Exactly two dialog actions, always English then 日本語, each with its own lang
attribute. Copy and order never vary with saved/requested locale. The long
saved/requested labels and old visible explanation are no longer rendered.
The current recipient-preference contract remains authoritative:
[Cross-App Locale Recipient Preference](../../e2r-spec/docs/cross-app/cross-app-locale-startup-v0-recipient-preference-design.md).
The new Human direction supersedes earlier dialog presentation only, not the
storage, startup, session or Dataset contract. No spec/schema was edited.

The scoped dialog layout uses a 28rem maximum width, 24px padding/gap, 8px between
question lines, and 12px between actions, with a small-screen padding adjustment.
Desktop actions share a row. Narrow actions wrap if needed and remain within the
viewport. Fonts, borders and application colors remain inherited; NarrativeLine
uses its accent token for the focus ring. Shared components are not reorganized.

## Accessibility and resolution boundary

Both questions form the labelled dialog title through language-tagged spans.
The existing modal roles are retained (NarrativeLine/LiaisonScape alertdialog,
ParameterPlotter dialog), with aria-modal and aria-labelledby. A referenced,
visually hidden bilingual description explains that the choice is for this visit
only and does not alter the saved language. It remains available in the accessibility
tree; lang markup is exposed on both descriptions and native buttons.

Fixed display order is independent of initial focus: the saved-language button
receives initial focus. Tab/Shift+Tab remain trapped; native Enter/Space activate
the choices. Escape and pointer backdrop dismissal select the saved language.
Existing opener restoration is retained where available; when dismissal leaves
focus on body, this startup dialog alone supplies a Header focus fallback.
It does not steal focus from an already restored element. The invisible
LiaisonScape backdrop is excluded from the accessibility/tab order; the visible
modal still has exactly two actions.

The original saved/requested resolution callbacks or attributes are reused.
Background UI stays in the saved locale until resolution. Choices remain session
presentation overrides; the saved preference is unchanged. Only the existing
explicit Header language selector persists preferences. Same-tab reload uses the
existing temporary-resolution record. No settings engine, URL contract, Dataset
acquisition/replacement/save behavior, or Handoff order was changed. Ordinary
selectors, Credits, other dialog behavior and Home-to-Hub markup are unchanged.

## Verification

Current local automated gates PASS:

| App | Tests | Other gates |
| --- | --- | --- |
| NarrativeLine | 410/410 | Lint and build PASS |
| LiaisonScape | 680/680 | Lint and build PASS |
| ParameterPlotter | 243/243 | 42-module syntax check and static build PASS; no lint script |

Existing Locale/History/Handoff and Home-to-Hub regression coverage remains in
the full suites. New/updated tests check fixed bilingual copy and order, lang,
description association, callbacks/routes and saved-focus/temporary selection.

Codex-operated isolated Edge 156, disposable browser Contexts, local candidates
only (not public deployment): 72 scenarios PASS = three apps x both saved/requested
conflicts x 1280/390/320px effective widths x English/Japanese/Escape/backdrop.
The scenarios check saved-language background, initial saved-button focus,
bilingual title and English/Japanese order, accessibility-tree dialog name,
description lang, visible focus, Tab/Shift+Tab wrap, Enter for English and Space
for Japanese, pointer backdrop and Escape behavior, expected effective locale,
unchanged saved preference, Header focus after closure, and reload continuity.
No overflow or native application exception was observed. Desktop and Narrow
screenshots were inspected; no material layout issue was found.

Six further browser cases (three apps x both conflict directions) use a safe,
synthetic Dataset with one Entity, Event and Relation. CDP fulfills only the test
fixture URL locally; this is not a live external-host/CORS or public-E2E claim.
Before language resolution: zero fixture requests. After choosing the requested
language: fixture fetch and application display succeeded, with saved preference
unchanged. The initial Entity-only fixture could not be checked by visible name
on NarrativeLine's Event timeline; adding an Event corrected the diagnostic
assertion without changing product source.

An initial browser snapshot confirmed the prior body-focus fallback. The local
focus enhancement was then verified across the entire 72-case matrix. Later
NarrativeLine focus-color refinement honors its existing accent token; final
lint/build and the full browser matrix passed again.

Diagnostic evidence is under the workspace root at
workspace/diagnostics/locale-conflict-bilingual-2026-11-05/:
browser-review.mjs, results.json, handoff-review.mjs, handoff-results.json,
per-app gate logs and screenshots. Implementation/source fingerprints bind the
final local files. These are Codex observations, not Human-operated acceptance.

## Preservation, knowledge and pending decisions

The pre-existing local Home-to-Hub publication addenda and LiaisonScape's three
untracked diagnostic items remain untouched; SHA-256 baseline checks passed.
No staging, Commit, Push or Deployment was performed. Home-to-Hub public evidence
remains valid at its earlier bounded scope and Human Publication Closure remains
PENDING; this separate UI task does not accept or close that publication.

Applied accepted workspace knowledge: responsibility-local incremental
modularization (no broad extraction), accepted dirty-worktree baseline recovery
(exact owned scope and unrelated-work preservation), workspace placement and
isolated Edge diagnostic guidance (temporary evidence only under workspace/diagnostics).
Source/automated/browser evidence and Human decisions remain separate. No hypothesis
was promoted into a new Locale or Dataset rule.

NOT VERIFIED: actual screen-reader speech/pronunciation, exhaustive other browser
engines, all pending-edit/save-failure/ownership states, and this candidate in the
public environment. DOM lang and accessibility-tree checks cannot establish real
screen-reader pronunciation. Before the decision below, the Human review of bilingual wording/hierarchy and
Desktop/Narrow focus behavior and these evidence limits remained pending for
Implementation Acceptance. Commit, Push and Deployment remain separate decisions.
## Repository-owned changes

- src/components/LocaleConflictDialog.tsx: bilingual title/help, fixed-order
  native actions mapped to original callbacks, saved initial focus, Header
  fallback and non-focusable/accessibility-hidden backdrop.
- src/styles.css: styles scoped to .detail.locale-conflict.
- tests/locale-conflict-dialog.test.ts: fixed bilingual markup/description checks.
- tests/appUiIntegration.test.ts: both saved locales and both selection routes,
  initial focus and preference non-persistence.
- This independent implementation record. App orchestration and Handoff unchanged.

Screenshot note: captured focus is after the scripted Tab-wrap check (English).
Initial saved-language focus was asserted before that interaction in every case.

## Bounded Implementation Acceptance — Human decision, 2026-11-05 JST

The Human explicitly accepted the local Cross-App Locale Conflict Dialog
unification in NarrativeLine, LiaisonScape and ParameterPlotter, adopting the
recorded Codex verification evidence: 410/680/243 automated tests, available
Lint/Build gates (including ParameterPlotter's syntax check), 72 isolated Edge
cases and six synthetic Dataset Handoff cases. This is a formal, bounded
Implementation Acceptance of that candidate, not merely the earlier UI design
approval. The unchanged implementation matched the recorded candidate fingerprints
before this documentation-only update. The manifest's documentation hashes retain
the pre-acceptance snapshot; no implementation or test file was changed here.

Scope is only the three apps' bilingual Locale Conflict Dialog UI, accessibility
markup, fixed English/Japanese action order, saved-language initial focus and
scoped dismissal/focus behavior, while preserving the existing recipient-preference
and Dataset Handoff contracts. No other feature or product release is accepted
by this decision.

This records Human acceptance of Codex-produced evidence. It does NOT record
that the Human personally performed these browser operations, nor convert the
Codex browser results into Human-operated browser or screen-reader evidence.

The Human explicitly leaves the following NOT VERIFIED:

- actual screen-reader speech/pronunciation;
- exhaustive verification of other browsers/engines;
- all pending-edit and save-failure states.

Other limits recorded above, including public-environment verification of this
candidate, are not promoted to PASS. The Human accepted the implementation with
these bounded evidence limits; the limits themselves remain unresolved checks.

Only this acceptance record was updated. Existing publication addenda, untracked
files and unrelated work remain preserved. No staging, Commit, Push or Deployment
was performed or authorized by this acceptance-record task. Publication remains
a separate decision. Home-to-Hub Navigation's earlier bounded public evidence
is unchanged, and its Human Publication Closure remains PENDING.

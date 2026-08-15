# Future Work: Unified Application Header Navigation

Status: Deferred; no implementation authorized by this note alone.

NarrativeLine currently uses a normal `<a>` link for its application name.
LiaisonScape uses a `<button>` so that returning Home can preserve an active
Dataset held in application state.

Future work may unify these implementations, but must preserve the existing
Dataset lifecycle behavior. Before changing either application, verify:

- Home and Workspace navigation;
- browser Back behavior;
- preservation of an active Dataset while returning Home;
- restoration through `Continue Editing`;
- refresh and direct-entry behavior; and
- keyboard and assistive-technology semantics.

The implementation should be changed only with corresponding navigation and
Dataset-state tests in both applications. Visual consistency alone is not a
sufficient reason to discard the current Dataset-preservation behavior.

## Future Home action alignment

The two applications should also converge on the following Home behavior:

- `Continue Editing` should be shown only when an editing Dataset is actually
  available in application state. NarrativeLine currently displays this action
  continuously; future work should align it with LiaisonScape's conditional
  behavior.
- `Continue Editing` should be the first action in the Home entry list.
  NarrativeLine currently places it first, while LiaisonScape currently places
  it last when shown; future work should align LiaisonScape with NarrativeLine's
  ordering.

These are part of the future navigation and Home UX acceptance criteria, and
should be covered by both applications' UI/state tests when implemented.

## Browser Back preference

LiaisonScape's current Home/Workspace navigation is preferable for Dataset
continuity because browser Back can return from the Workspace to Home while
the active Dataset remains held by the application. This behavior should be
preserved in any future header-link unification.

NarrativeLine currently changes `currentScreen` through an in-memory
`NavigationService`; it does not currently create or consume browser-history
entries for its screen transitions. Therefore its individual screens do not
currently support equivalent browser-Back navigation. It should be possible
to add this in a future navigation workstream; this is an explicitly retained
future improvement for NarrativeLine. That work must define and
test history entries for Home, Timeline, detail, picker, and creation screens,
along with Dataset retention, refresh/direct-entry behavior, and Back/Forward
semantics.

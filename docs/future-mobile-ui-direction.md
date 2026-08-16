# Future Direction: LiaisonScape Mobile UI

Status: Exploratory post-MVP UX workstream; no implementation decision

This is not a requirement for the LiaisonScape First Distribution. The current
First Distribution remains desktop-oriented. Any future mobile experience must
preserve the same Dataset semantics and must be planned separately from the
current MVP and release scope.

## Context

Touch acceptance for Direct Graph Authoring confirmed that the current graph
workspace can support one-finger pan, Entity dragging, Relation curve-handle
interaction, two-finger pinch zoom, and long-press context actions. It also
showed that the small visible targets used on desktop are difficult to operate
reliably on a phone.

This is not a long-press regression. It is a separate product and UX concern:
the smartphone experience should not be treated as a narrowly scaled version of
the desktop interface.

## Direction

LiaisonScape should eventually provide a substantially different mobile UI
where layout, controls, and interaction affordances are designed for touch
first. The desktop graph workspace may remain dense and pointer-oriented while
the mobile workspace prioritizes reachable controls, clear modal/detail flows,
and gesture-safe authoring.

The visual mark of a control does not need to become large merely to make it
operable. A small visible Entity, Relation, or curve handle may use a larger
transparent pointer hit area, provided that neighboring targets remain
unambiguous and the expanded area does not interfere with node drag, pan, or
pinch recognition.

## Candidate product model: focused relationship explorer

The phone experience should be investigated as a relationship explorer rather
than as a desktop graph editor reduced to a smaller viewport. A full Dataset
graph with nodes, connection names, connection ports, and curve controls can
become too dense to operate reliably on a phone.

A candidate primary screen places one focused Entity at the center and shows
only its one-hop neighbors. Tapping a neighboring Entity makes that Entity the
new focus:

```text
Alice (focused)
  -> tap Bob
Bob (focused)
  -> tap Carol
Carol (focused)
```

This “walk the graph” model fits LiaisonScape's relationship-explorer purpose.
The phone UI can provide Entity search, an Entity list, recently viewed
Entities, a list of the focused Entity's connections, and an optional compact
overview instead of keeping the complete graph visible at all times.

The full graph editor may remain the primary desktop and tablet experience.

## Candidate phone interaction patterns

### Detail and Relation sheets

Entity and Relation details should be investigated as bottom sheets rather than
centered desktop dialogs. A sheet can show the focused Entity's name,
description, connections, and actions such as edit or delete. It may expand
upward for more detail and collapse back to the focused graph.

Relation details can similarly show the two endpoints and the connection name
without requiring a precise tap on a crowded line.

### Simplified connection display

In the normal focused view, a connection may show only its line and direction.
When selected, its connection name can be emphasized. If several Relations
connect the same pair of Entities, a count may be shown and the sheet can list
the individual Relations.

This is a presentation choice and must not change Core Relation data or imply
that an unlabeled line has no meaning.

### Form-based authoring

Phone authoring should avoid requiring users to hit a small connection port,
drag a crowded line, or place nodes precisely. Candidate flows are:

- add a Relation from a focused Entity;
- search for and select the connection target;
- enter the name and description;
- save the Relation;
- edit endpoints through “source” and “target” fields rather than graph drag.

The Dataset semantics and authoring results remain the same as on desktop; the
interaction model may differ by device.

## Coordinate and mobile composition

The focused phone view may place the selected Entity at the center and arrange
its neighbors automatically. This is a mobile viewport composition, not an
implicit rewrite of saved LiaisonScape Coordinates.

If needed, a separate mode may show the saved arrangement. The design must keep
these concepts distinct:

- persisted Dataset Coordinate data;
- mobile presentation and one-hop composition;
- temporary phone viewport state such as focus, pan, zoom, and selection.

## Device tiers

A future product investigation may use three interaction tiers:

- Desktop: full graph editor;
- Tablet: simplified full graph editor with touch-oriented controls;
- Phone: focused relationship explorer with sheets and form-based authoring.

This does not require all devices to share one responsive layout. Shared Dataset
semantics and interoperability are more important than identical interaction
surfaces.

## Future investigation

- mobile-specific layout and toolbar placement;
- touch-sized hit areas for Entity, Relation, and curve handles;
- bottom-sheet or reachable detail and creation flows;
- discoverable long-press and drag affordances;
- gesture arbitration when expanded hit areas overlap;
- narrow-screen visibility of graph content and controls;
- mouse/pen/keyboard behavior remaining intact on desktop;
- whether a responsive mobile workspace or a separate mobile presentation is
  the clearer boundary.
- whether one-hop focus should be the default phone view or an optional mode;
- how users search, navigate backward, and return to recently viewed Entities;
- how to represent multiple Relations between the same pair in a compact view;
- how bottom-sheet state interacts with browser history and deep navigation;
- which overview, if any, is useful without recreating the dense desktop graph;
- what accessibility model is needed for focus transitions, sheets, and gestures.

This workstream must not silently change Core, Coordinate, or Relation domain
semantics. It is independent of the completed Touch Long-Press + Gesture
Arbitration acceptance and should be planned before broadening connection-handle
authoring to touch and pen.

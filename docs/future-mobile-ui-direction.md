# Future Direction: LiaisonScape Mobile UI

Status: Future UX workstream; no implementation decision

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

This workstream must not silently change Core, Coordinate, or Relation domain
semantics. It is independent of the completed Touch Long-Press + Gesture
Arbitration acceptance and should be planned before broadening connection-handle
authoring to touch and pen.


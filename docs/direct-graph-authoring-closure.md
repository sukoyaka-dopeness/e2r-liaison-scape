# LiaisonScape Direct Graph Authoring MVP Closure

Status: `DIRECT GRAPH AUTHORING MVP COMPLETE`

This checkpoint closes the current Direct Graph Authoring MVP. It does not
claim that every future graph-authoring interaction is complete.

## Accepted behavior

### Entity authoring

- The existing Add Entity button remains available.
- Normal Add Entity uses the current visible viewport center as a temporary
  graph position.
- Blank-canvas right-click and touch/pen long-press expose the existing Add
  Entity context action at the selected graph position.
- Creation cancellation leaves both Dataset data and temporary placement
  unchanged.
- Temporary positions are not automatically written to Coordinate data.
- Entity nodes use a 64 × 64 rounded-square shape.
- Entity body drag moves the Entity.
- The small circular connection port is visually attached to the Entity and
  starts mouse-only Relation creation.

### Relation authoring

- Connection-port drag sets source and previews a derived temporary edge.
- Valid Entity drop opens the existing Relation Creation Dialog with source and
  target prefilled.
- Self and parallel Relations remain allowed through existing `createRelation()`.
- Blank/invalid drop, Escape, pointercancel, or dialog cancellation leaves the
  Dataset unchanged.
- Preview state is application-derived and is not serialized.
- Touch/pen connection-port Relation creation remains deferred.

### Relation interaction and curvature

- Relation click selects the Relation.
- Relation right-click and long-press open Relation Detail.
- Only a selected Relation edge can be dragged to adjust curvature.
- An unselected Relation drag does not change curvature.
- A 24px transparent hit area improves edge selection without changing visible
  edge width.
- Pointerup commits curvature; Escape and pointercancel restore the original
  curvature.
- Self and parallel Relation curvature remain supported.
- The legacy circular curvature handle has been removed.
- The hint `Drag the selected relation to adjust its curve.` appears in the
  existing selection-actions area while a Relation is selected.

### Viewport and touch interaction

- Normal wheel remains browser page scrolling.
- Ctrl+wheel performs pointer-centered graph zoom.
- Zoom controls remain available in a draggable, session-only floating toolbar.
- One-finger pan, Entity drag, two-finger pinch, long-press, and post-pinch
  gesture recovery are accepted.
- Long-press uses the 500ms / 8px contract and keeps suppression local to the
  originating interaction.

## Preserved boundaries

This workstream reused existing domain operations and did not change:

- E2R Core, Entity, or Relation semantics;
- Relation endpoint or `updateRelation()` contracts;
- Dataset format or unknown-field preservation;
- Coordinate semantics or Coordinate persistence boundaries;
- Relation Arrow Appearance;
- GraphCanvas architecture or unrelated cleanup.

## Explicitly deferred

The following remain outside this closure:

- touch/pen connection-port Relation creation;
- mobile-specific UI redesign and broad touch hit-area expansion;
- Relation routing/collision avoidance and self-loop clearance policy;
- automatic-route versus manual-curvature priority policy;
- Relation Arrow Appearance;
- Group/Cluster implementation or schema/semantics;
- Home/Entry UX and Japanese localization;
- first-distribution legacy migration decision;
- Coordinate origin changes;
- GraphCanvas extraction and architecture cleanup.

The related documents remain non-authorizing future explorations:

- `docs/future-mobile-ui-direction.md`
- `docs/future-relation-routing-collision-avoidance.md`
- `docs/future-group-cluster-design.md`
- `docs/future-relation-arrow-appearance.md`
- `docs/future-coordinate-origin-decision.md`

## Closure verdict

`DIRECT GRAPH AUTHORING MVP COMPLETE`

This means graph-native Entity creation, mouse graph-native Relation creation,
mouse/touch context actions, and graph-native Relation curvature editing are
available and accepted within the stated boundaries. It does not declare
first-distribution readiness or completion of deferred UX workstreams.


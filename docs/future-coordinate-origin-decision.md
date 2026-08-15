# Future Decision Candidate: LiaisonScape Coordinate Origin

Status: Decision recorded — defer center-origin Coordinate Space

This document records a future design question about the LiaisonScape user
coordinate system. It does not change the current Coordinate profile, saved
values, migration behavior, or Direct Graph Authoring implementation.

## Current behavior

New Entities do not automatically receive saved Dataset Coordinates. The
application gives them a temporary graph position so they appear immediately.
Entities without Coordinates also receive temporary deterministic positions
through `buildEntityGraph()`; absence of a Coordinate does not make an Entity
disappear.

Direct Graph Authoring should place an Entity created from an empty-canvas
right-click or long-press at the selected viewport position after converting
the pointer through the current SVG/viewBox and viewport transform. This is
the important UX guarantee: an Entity created at a visible canvas location
should appear at that location immediately, without automatically persisting a
Coordinate.

## Central-origin proposal

A future LiaisonScape user coordinate system could use a central origin:

```text
          -Y
           |
-X --------0-------- +X
           |
          +Y
```

A central `(0, 0)` can be conceptually attractive for an unbounded relationship
graph. It may better communicate that the graph extends in every direction.
However, the current pan/zoom implementation already provides an effectively
unbounded user experience. Negative JavaScript/TypeScript numeric coordinates
are valid, and the present origin does not prevent expansion left or upward.

## Compatibility concern

LiaisonScape already writes values in the experimental `liaisonscape-graph`
Coordinate Space. Changing the meaning of saved values such as `(400, 250)`
would require an explicit decision:

- reinterpret existing values as positions relative to a new `(0, 0)`;
- preserve existing values and use the central origin only for new data; or
- define and migrate a new Coordinate Space identity.

These alternatives have different interoperability and migration consequences.
Changing the origin is therefore closer to changing Coordinate Space semantics
than to changing a viewport implementation. Coordinate and migration work is
compatibility-sensitive and should not be reopened merely to support Direct
Graph Authoring.

## Current disposition

Decision for the current MVP and Direct Graph Authoring work: retain the
existing graph-coordinate model and defer a center-origin Coordinate Space.
The meaning of persisted `liaisonscape-graph` values must not change as a
side effect of improving Entity placement.

For current Direct Graph Authoring work:

- keep the existing internal graph-coordinate model;
- guarantee viewport-local placement for pointer-created temporary Entities;
- do not automatically save a Coordinate;
- preserve the explicit `Save node coordinates` boundary; and
- do not reinterpret or migrate existing saved Coordinate values.

The normal toolbar `Add Entity` action may nevertheless place a new Entity at
the center of the currently visible viewport. This is a temporary application
position calculated by inverse viewport transformation; it is not a change to
the Coordinate Space origin and does not write Dataset Coordinate data.

The central-origin question should be revisited as an independent Coordinate
Space formalization decision before any saved-space semantics are changed.

## Future decision questions

When Coordinate Space is formally reconsidered, evaluate:

- user comprehension and graph-navigation ergonomics;
- existing `liaisonscape-graph` values and compatibility;
- whether a new Space ID is required;
- migration ordering and refusal behavior;
- interoperability with NarrativeLine and other E2R applications; and
- whether the benefit exceeds the complexity of preserving the current space.

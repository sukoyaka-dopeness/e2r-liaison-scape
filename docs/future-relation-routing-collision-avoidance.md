# Future Work: Relation Routing and Collision Avoidance Policy

Status: Observation recorded; no implementation in the current curvature UI work

## Observations

Direct Relation Edge Curvature Manipulation acceptance showed two follow-up
questions:

- a self-loop does not appear to gain ordinary node repulsion when another
  Entity approaches its loop;
- a selected or focused Relation does not appear to gain the same automatic
  clearance behavior as an unselected route.

These observations are intentionally outside the completed removal of the
legacy curvature handle.

## Future policy direction

Self-loops should likely be treated through loop radius and route clearance,
not ordinary endpoint-to-node repulsion. Automatic routing may adjust a loop to
avoid nearby Entities when the Relation has no user geometry override.

The future policy should distinguish:

- automatic route: eligible for collision avoidance and clearance adjustment;
- manual curvature override: user-specified geometry takes priority over
  automatic movement.

Selection or focus alone should not silently disable necessary automatic
clearance. The interaction between selection state, automatic routing, and
manual overrides requires a separate decision pass.

This follows the existing Layout principle that automatic results may be
replaced by an intentional user override. It must not change Core Relation
semantics, endpoint identity, Coordinate semantics, or curvature persistence
without a separate compatibility decision.


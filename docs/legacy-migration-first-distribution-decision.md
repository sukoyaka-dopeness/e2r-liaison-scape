# Legacy Migration First Distribution Decision

Decision: `REMOVE LEGACY MIGRATION ACTION FROM FIRST DISTRIBUTION UI`

The oldest legacy migration action is removed from the general More menu for
First Distribution. The decision applies only to the product UI action.

## Retained compatibility boundary

The following remain unchanged and retained:

- legacy migration service and API;
- readiness and assessment types;
- refusal code and path vocabulary;
- fail-closed behavior;
- migration transformation;
- migration tests and historical fixtures;
- compatibility documentation.

Coordinate Prototype to Coordinate Draft and Linkscape Space to LiaisonScape
Space migration actions remain available in the More menu.

## Rationale

First Distribution users are not expected to discover or operate on the
oldest Linkscape coordinate representation. Keeping this advanced compatibility
action in the general product menu would add legacy terminology and imply a
normal workflow that is not required for the intended audience.

Retaining the implementation protects historical Dataset and fixture
compatibility without exposing the action in the distributed UI.

## Follow-up

After First Distribution, run a separate Legacy Linkscape Compatibility
Cleanup audit. It may decide whether the retained service, API, tests, and
fixtures should remain permanently or be archived. This decision does not
authorize that cleanup.

# LiaisonScape Coordinate Draft Migration Profile

Status: Implementation profile; explicit migration is enabled for this exact profile

This document defines the exact experimental Coordinate Prototype data that
LiaisonScape may consider for an explicit migration to Coordinate Draft `0.1.0`.
It is intentionally narrower than the Prototype and Draft specifications.

The read-only assessment is implemented by `assessCoordinateDraftMigration`.
It never changes the Dataset and a ready result is not permission to migrate
without final target construction and Draft-aware validation.

## Accepted source

The source must use only:

- `experimental.github.sukoyaka-dopeness.coordinate`;
- Dataset `formatVersion: "0.1.0"`;
- zero or one Dataset-local Space, which when present is
  `linkscape-graph`;
- exact Space `kind: "cartesian-2d"`;
- exactly Components `x` and `y`;
- exact unit `linkscape-user-unit`;
- exact directions `display-right` for `x` and `display-down` for `y`;
- optional non-empty display names; and
- finite, possibly partial `x` and `y` Entity or Event values.

LiaisonScape accepts absence and presence of the listed fields exactly as stated.
It does not infer equivalent names, units, directions, Components, or Spaces.

If the supported Specification Extension occurs, this first profile accepts
only its simple exact `0.1.0` bootstrap and complete `uses` declarations. The
Prototype declaration must occur exactly once at version `0.1.0`.

## Atomic refusal

Assessment refuses the entire migration when any of the following occurs:

- the Draft identifier already occurs anywhere;
- the Dataset-level Prototype payload is missing or not exact `0.1.0`;
- a Prototype field is unknown;
- a Relation carries Prototype Coordinate data;
- a Space or Component is duplicate, unresolved, or outside the exact profile;
- another Space occurs, even when `linkscape-graph` itself is compatible;
- `minimum`, `maximum`, or `period` occurs;
- `externalReference` occurs;
- a value is non-finite or uses another Component; or
- a present Specification payload is incomplete, conflicting, or outside the
  simple profile.

In particular, the current cross-application demo is not migration-ready: its
`harbor-site-plan` Space is preserved by LiaisonScape but is not semantically
implemented by Linkscape. Partial migration would split one Coordinate layer
between two identities and is therefore prohibited.

## Explicit execution

The explicit `Migrate Coordinate to Draft` action constructs the complete
proposed Dataset, changes the exact payload identity and `specVersion`, updates
an already complete Specification declaration when present, and validates the
target with Validator `0.2.0`. Only a successful whole-Dataset validation is
adopted; the source remains unchanged on refusal. LiaisonScape then reads the
exact supported Draft `linkscape-graph` positions on subsequent opens.
The same exact profile is writable for later explicit coordinate saves; a
generic Draft Space remains read-only to LiaisonScape.

Opening, graph layout, ordinary coordinate saving, Core Detail editing,
serialization, and Export never trigger migration. The action is unavailable
when the read-only assessment refuses the Dataset.

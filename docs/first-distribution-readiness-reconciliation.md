# First Distribution Readiness Reconciliation

Status: `RECONCILED AT CURRENT MVP CHECKPOINTS`

This document supersedes stale first-distribution assumptions recorded before
the current LiaisonScape MVP closures. It is a scope and readiness record, not
an authorization to change production behavior.

## Current checkpoints

- Direct Graph Authoring: `6e669e6 feat: complete Direct Graph Authoring MVP`
- Home / Entry UX closure: `155415c docs: record Home entry UX closure`
- LiaisonScape i18n MVP: `ae3290b feat: complete LiaisonScape i18n MVP`

## Must resolve before First Distribution

### Legacy migration product decision — RESOLVED

The oldest legacy migration action is removed from the First Distribution UI.
The migration service, API, readiness assessment, fail-closed semantics,
tests, fixtures, and compatibility vocabulary remain retained. The Coordinate
Prototype and Linkscape Space migration actions remain in the More menu.

See `docs/legacy-migration-first-distribution-decision.md` for the decision
record.

### Distribution mechanics and documentation

Verify README and requirements, build/run instructions, package metadata,
representative sample Dataset, known limitations, repository/release state,
and reproducible verification instructions.

## Should resolve during First Distribution preparation

- small visual polish that materially affects first impression, especially the
  oversized button text and borders noted for LiaisonScape and NarrativeLine;
- migration labels and first-import wording after the Legacy migration
  decision;
- release-facing user-guide and known-limitations review.

## Post-distribution candidates

These are not First Distribution blockers merely because they are future work:

- navigation redesign and broader history architecture;
- validation diagnostic friendly explanations, advanced details, and
  related-ID presentation;
- routing / collision-avoidance policy extensions;
- Relation Arrow Appearance;
- Mobile UI redesign and broad touch hit-area expansion;
- Group / Cluster design and implementation;
- Coordinate origin changes;
- Stable Coordinate standardization;
- additional locales.

## Already closed

- Direct Graph Authoring MVP;
- Home / Entry UX MVP;
- Relation Endpoint Editing MVP;
- LiaisonScape i18n MVP.

The Direct Graph Authoring closure includes Entity creation, viewport-center
placement, canvas actions, mouse connection-port Relation creation, self and
parallel Relations, selected Relation curvature manipulation, the 24px hit
area, curvature discoverability, and touch/pen long-press arbitration.

## Current conclusion

No new feature work is selected by this reconciliation. The next valid
workstream is First Distribution preparation: define the distribution method,
verify documentation and mechanics, then apply only first-impression polish
that is actually needed.

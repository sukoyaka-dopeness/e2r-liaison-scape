# LiaisonScape

LiaisonScape is an E2R relationship explorer and Entity-first reference application for exploring E2R
relationships. Its MVP boundary is defined by the
[E2R-SPEC acceptance criteria](https://github.com/sukoyaka-dopeness/e2r-spec/blob/main/applications/liaisonscape-mvp-acceptance.md).

## Current status

The initial React + TypeScript + Vite application implements the documented
Entity-first MVP boundary. It imports and validates Datasets, preserves invalid
input for the caller, displays Entity nodes and directed Relation edges,
supports Entity selection and Detail, zooming, panning, temporary dragging,
stored-coordinate restoration, explicit coordinate saving through the
authority-qualified Coordinate interoperability prototype, and Export-time
Validator checks. Explicit save migrates LiaisonScape's earlier
`extensions.coordinate.positions` values while preserving unrelated legacy
data. It refuses to overwrite an existing `linkscape-graph` Space whose kind,
units, directions, or duplicate claims are incompatible, and preserves
supported fields written by another application. It also supports Entity and
Relation Detail editing for Core
`name` and `description`, Relation labels, mobile pinch zoom, automatic graph
fitting, obstacle-aware edge routing, and movable labels. Unknown Core fields
and Extensions survive save round trips.

LiaisonScape uses E2R Validator `0.2.0`. It recognizes exact Specification
Extension draft `0.1.0` declarations, reports undeclared Metadata and History
versions as non-blocking diagnostics, and opens the fully declared shared
cross-application fixture without warnings.

The acceptance test suite currently covers A1 through A19, including self and
parallel Relations, Event-endpoint limitations, deterministic fallback
positions, view-state separation, and warning/error distinction.

Event editing, semantic Relation types, Relation creation/deletion,
Stable Coordinate/Layout Extensions, graph search/filtering, and
application view-state serialization are outside the initial MVP.

LiaisonScape treats the distinct Coordinate Extension draft `0.1.0` as a
separate identity. It can read an exact supported `linkscape-graph` Draft
payload and restore its Entity positions. A clearly explicit `Migrate
Coordinate to Draft` action accepts only the conservative profile below,
builds a complete target Dataset, validates it with Validator `0.2.0`, then
replaces the Prototype payload atomically. Opening, arranging, ordinary
coordinate saving, and Export never trigger this migration. After migration,
LiaisonScape can save positions back to that same exact writable Draft profile.
Unsupported Draft payloads remain opaque, and the Prototype is never written
beside any Draft occurrence.

The conservative migration readiness profile is documented in
[`docs/coordinate-draft-migration-profile.md`](docs/coordinate-draft-migration-profile.md).
It currently accepts only the exact legacy `linkscape-graph` semantics LiaisonScape
implements; broader Spaces and external references remain refused.

The browser migration workflow can be tried with
[`examples/coordinate-prototype-migration-ready.e2r.json`](examples/coordinate-prototype-migration-ready.e2r.json).
Open it, choose `Migrate Coordinate to Draft`, export the result, and reopen
the exported JSON to verify that the same Entity positions are restored.

## User guides

- [Japanese user guide](docs/user-guide-ja.md)
- [English user guide](docs/user-guide-en.md)

## Development

```text
npm install
npm test
npm run lint
npm run build
npm run dev
```

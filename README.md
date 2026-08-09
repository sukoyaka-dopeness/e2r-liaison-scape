# Linkscape

Linkscape is an Entity-first reference application for exploring E2R
relationships. Its MVP boundary is defined by the
[E2R-SPEC acceptance criteria](https://github.com/sukoyaka-dopeness/e2r-spec/blob/main/applications/linkscape-mvp-acceptance.md).

## Current status

The initial React + TypeScript + Vite application implements the documented
Entity-first MVP boundary. It imports and validates Datasets, preserves invalid
input for the caller, displays Entity nodes and directed Relation edges,
supports Entity selection and Detail, zooming, panning, temporary dragging,
stored-coordinate restoration, explicit coordinate saving, and Export-time
Validator checks. Unknown Core fields and Extensions survive save round trips.

The acceptance test suite currently covers A1 through A19, including self and
parallel Relations, Event-endpoint limitations, deterministic fallback
positions, view-state separation, and warning/error distinction.

Event editing, semantic Relation labels, Relation creation/deletion,
standardized Coordinate/Layout Extensions, graph search/filtering, and
application view-state serialization are outside the initial MVP.

## Development

```text
npm install
npm test
npm run lint
npm run build
npm run dev
```

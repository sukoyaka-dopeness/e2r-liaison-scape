# Linkscape

Linkscape is an Entity-first reference application for exploring E2R
relationships. Its MVP boundary is defined by the
[E2R-SPEC acceptance criteria](https://github.com/sukoyaka-dopeness/e2r-spec/blob/main/applications/linkscape-mvp-acceptance.md).

## Current status

The initial React + TypeScript + Vite application is in place. The current
slice implements Dataset import, shared Validator diagnostics, invalid-input
preservation for the caller, and JSON save round trips that retain unknown
Core fields and Extensions.

Graph rendering and navigation are the next MVP slice. Event editing,
semantic Relation labels, standardized Coordinate/Layout Extensions, and
application view-state serialization are outside the initial MVP.

## Development

```text
npm install
npm test
npm run lint
npm run build
npm run dev
```

# LiaisonScape Entity / Relation Creation MVP Decision

Status: decision pass complete; implementation not started.

## Current-state inventory

The current application already supports importing and validating a Dataset,
exporting only after Validator checks, selecting Entity and Relation graph
items, and editing `name` / `description` through the existing detail dialogs.
The relevant implementation is in `src/App.tsx` and `src/dataset.ts`:

- `loadDataset`, `serializeDataset`, and `validateDatasetForExport` implement
  the load/save/export boundary.
- `getEntityDetail` / `updateEntityDetails` and
  `getRelationDetail` / `updateRelationDetails` implement detail editing.
- `selectedId`, `selectedRelationId`, and `detailOpen` are local UI state.
- `buildEntityGraph` and `fitGraphView` provide deterministic temporary graph
  positions; `positions`, pan, zoom, label offsets, and route overrides are
  application view state.
- Coordinate persistence is explicit through `applyStoredCoordinates`; opening
  or moving a graph item does not by itself create a Coordinate Extension.
- `resetView` resets selection and view state only.
- No Dataset-level Undo/Redo or history stack exists. Cancel will therefore
  discard only an uncommitted local creation draft.

## Core constraints

Creation must preserve the current Core rules: Object IDs are non-empty and
Dataset-wide unique across Entity, Event, and Relation; Relation endpoints must
resolve within the same Dataset; endpoints may be Entity or Event; Relations
may not target Relations; self and parallel Relations are allowed; direction is
structural; and Core defines no Relation `type` field.

The initial creation UI is intentionally narrower than Core: it offers only
Entity-to-Entity Relation endpoints. Imported Event-endpoint Relations remain
readable and preserved.

## MVP decisions

### Entity

`Add Entity` opens a local draft without mutating the Dataset. Save generates a
Dataset-wide unique application-local ID at commit time, appends one Entity,
and stores optional trimmed `name` and `description` fields. Blank or
whitespace-only fields are omitted, and an Entity without `name` is valid.
No Coordinate, Names, Layout, Perspective, or other Extension is created.
Cancel leaves the Dataset unchanged. On success, select the new Entity and
reuse the existing Entity Detail UI.

### Relation

`Add Relation` opens a local draft with required Source Entity and Target Entity
choices plus optional `name` and `description`. Save requires both endpoints to
resolve to current Entities and generates a Dataset-wide unique ID at commit
time. Self and parallel Relations are allowed; duplicate endpoint pairs are
not rejected. Relation endpoints, inferred semantic types, and Extensions are
not created. On success, select the new Relation and reuse the existing
Relation Detail UI. Cancel leaves the Dataset unchanged.

### IDs, undo, and state boundaries

ID generation is LiaisonScape-local authoring behavior. It must use a
collision-checked generated identifier without adding a shared dependency or
changing the E2R specification. Dataset Undo/Redo is out of scope: pre-save
Cancel is draft discard, while post-save undo and deletion belong to later
workstreams. Selection, dialog state, focus, pan, zoom, temporary positions,
and routing state are never serialized.

## Acceptance-test inventory

Entity creation: create on an empty Dataset; Cancel/no mutation; optional and
blank fields; Dataset-wide collision handling; graph appearance; no Coordinate
creation; unknown-data preservation; save/export/reopen persistence.

Relation creation: existing A→B; newly-created A→B; self Relation; parallel
Relation; missing or unresolved endpoint refusal; Relation-to-Relation refusal;
Dataset-wide ID uniqueness; no semantic `type`; graph appearance;
preservation; save/export/reopen persistence.

UI and regression: selection after successful creation; Cancel behavior; no
Dataset Undo; no View State serialization; existing Entity/Relation editing;
canonical and legacy Coordinate behavior; Stage 5A/5B and Prototype/Draft
regressions; routing; Event-endpoint preservation; unknown Core/Extension,
Names, Source/Citation, and Target Reference preservation.

Interoperability: LiaisonScape create/export, Validator acceptance,
NarrativeLine import/preservation/export, and LiaisonScape reopen with created
objects intact.

## Planned implementation files and risks

Likely changes are `src/dataset.ts`, `src/App.tsx`, `src/styles.css`,
`tests/dataset.test.ts`, `tests/graph.test.ts`, and the English/Japanese user
guides. Main risks are accidental whole-Dataset reconstruction, accidental
Coordinate creation, ID collisions across all Core collections, and exposing
Event or Relation endpoints in the first creation UI.

Verdict: `READY FOR TEST-FIRST IMPLEMENTATION`

## Acceptance closure checklist

Manual acceptance completed for the current UI:

- Add Entity -> Cancel leaves the Dataset unchanged.
- An Entity with an empty name can be created.
- Add Relation supports A -> B, A -> A self Relations, and a second A -> B
  parallel Relation.
- Relation creation Cancel leaves the Dataset unchanged.
- Successful creation selects the new Entity or Relation.
- Entity creation does not persist Coordinates; temporary placement remains
  until the explicit Save node coordinates action.

Round-trip acceptance:

- Export/reopen preserves created Entity IDs, names, descriptions, Relation
  IDs, and Relation source/target IDs.
- Validator accepts the exported Dataset.
- NarrativeLine imports and exports the Dataset without changing created Core
  objects.
- LiaisonScape reopens the NarrativeLine export with the same objects.
- Creation adds no Coordinate payload and no semantic Relation `type`.

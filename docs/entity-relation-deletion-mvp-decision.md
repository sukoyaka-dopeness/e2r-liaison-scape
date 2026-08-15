# LiaisonScape Entity / Relation Deletion MVP Decision

Status: MVP implementation complete; manual acceptance and interoperability
closure recorded below.

## Current-state inventory

The current baseline has no Entity or Relation deletion helper. `src/App.tsx`
owns selection (`selectedId`, `selectedRelationId`), modal state
(`detailOpen`), and immutable Dataset replacement through `setDataset`.
`src/dataset.ts` provides load/export, Validator-before-export, graph
reconstruction, coordinate persistence, and Entity/Relation detail updates,
but no removal operation.

Graph positions are reconstructed by `buildEntityGraph`; temporary positions,
pan, zoom, label offsets, route overrides, and coordinate-dirty state are
application view state. A Dataset mutation must not implicitly serialize or
garbage-collect any of those values. Existing modal close/Cancel behavior
leaves the Dataset unchanged.

## Core integrity findings

The Core and Validator require non-empty Dataset-wide unique IDs across Entity,
Event, and Relation. Relation `sourceId` and `targetId` must resolve to an
Entity or Event in the same Dataset; Relation endpoints may not be Relations.
Self and parallel Relations are valid, and direction is structural only.
Therefore an Entity with any incident Relation cannot be removed while leaving
that Relation in `relations`, including self Relations, parallel Relations, and
Relations whose other endpoint is an Event. Imported Event-endpoint Relations
remain valid Core data even though creation currently offers Entity endpoints
only.

## Reference-owner policy

LiaisonScape will inspect the Core `relations` array as its known reference
contract. It will not recursively search opaque unknown Extensions for strings
matching an object ID and will not infer reference semantics from arbitrary
fields. Object-local Extension data disappears with the deleted object because
the object disappears. Dataset-level Extensions, Coordinate Space definitions,
Specification data, and unknown opaque payloads remain unchanged.

Deletion is therefore permitted in a Dataset containing unknown Extensions;
those Extensions are not silently rewritten. Future known reference contracts
may add explicit refusal rules in a separate decision.

## Relation deletion decision

An explicitly selected Relation may be deleted as one Core object. The
operation removes exactly that Relation, preserves every Entity, Event, sibling
parallel Relation, endpoint, unknown field, Extension, Coordinate payload,
Names data, and Dataset-level data, and performs no cascade, retargeting, or
semantic inference. A missing or stale Relation ID returns an explicit
refusal and the original Dataset unchanged.

## Entity deletion decision

An Entity may be deleted only when the current Dataset contains zero Relations
whose `sourceId` or `targetId` equals that Entity ID. Any incident Relation
causes an explicit refusal that reports the incident count and advises removal
of those Relations first. No cascade-delete checkbox or automatic cascade is
introduced. A missing or stale Entity ID also refuses without mutation.

On successful deletion, only the Entity object is removed. Its object-local
Extensions disappear with it; Dataset-level Coordinate Spaces and unrelated
objects remain. Coordinate garbage collection, Names cleanup, and reference
repair are out of scope.

## Proposed pure APIs

Use assessment plus mutation results consistent with migration safety:

```text
assessRelationDeletion(dataset, relationId)
deleteRelation(dataset, relationId)
assessEntityDeletion(dataset, entityId)
deleteEntity(dataset, entityId)
```

Each operation must re-resolve the supplied ID against the current Dataset,
return an explicit success/refusal result, avoid mutating its input, and never
partially update arrays. UI confirmation is a separate layer and must not be
the source of Core integrity checks.

## Acceptance-test inventory

Relation: ordinary, self, and one-of-parallel deletion; sibling parallel
survival; missing-ID refusal; unchanged Dataset on refusal; preservation of
unrelated Core objects, unknown fields, and Extensions; save/export/reopen.

Entity: unreferenced success; source- and target-referenced refusal; self and
parallel incident blocking; Event-endpoint incident blocking; missing-ID
refusal; no cascade; unchanged Dataset on refusal; object-local Extension
removal only with the Entity; Dataset-level Coordinate Spaces retained;
unrelated data preserved; save/export/reopen.

UI: confirmation Cancel leaves the Dataset unchanged; successful Relation and
Entity deletion clear their selection; zoom/pan remain unchanged; no Undo is
introduced.

Interoperability: deletion export is accepted by Validator, survives
NarrativeLine import/export, reopens in LiaisonScape, leaves deleted objects
absent, and preserves surviving IDs and valid endpoints.

## Out of scope and risks

Cascade or bulk deletion, Event deletion, endpoint editing, automatic repair,
Coordinate garbage collection, Names cleanup, Layout/Perspective cleanup, and
Undo/Redo are excluded. The main risk is accidentally treating opaque
Extension strings as references or accidentally deleting Dataset-level
Coordinate data while removing an object.

Verdict: `READY FOR TEST-FIRST DELETION IMPLEMENTATION`

## Closure notes

Pure deletion APIs, domain tests, selection-context delete actions, refusal
messages, and confirmation behavior are implemented. The local creation ->
blocked Entity deletion -> Relation deletion -> Entity deletion scenario
passes, and export/reopen validation preserves surviving IDs and endpoints.

Manual acceptance should confirm ordinary, self, and parallel Relation deletion,
blocked Entity deletion with an incident count, successful deletion after
removing Relations, selection clearing, and stable zoom/pan. Cross-application
Validator and NarrativeLine round-trip checks remain part of the final manual
acceptance gate.

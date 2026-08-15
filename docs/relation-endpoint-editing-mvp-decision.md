# Relation Endpoint Editing MVP Decision

Status: `RELATION ENDPOINT EDITING MVP MANUAL ACCEPTANCE COMPLETE`

Date: 2026-08-15

This is a non-normative LiaisonScape application decision record. It does not
change the E2R Core or authorize edits to the Core specification.

## Inventory

The current `RelationService` supports Entity-only Relation creation,
name/description updates, detail lookup, and deletion. `getRelationDetail`
already resolves Entity or Event endpoints. The graph projection remains an
Entity-first view and counts Relations with Event endpoints as unsupported for
display. Existing detail updates copy the Relation before changing editable
fields, preserving unknown fields and object-local Extensions.

The E2R Core requires each endpoint to resolve to an Entity or Event, permits
self-relations, and does not prohibit parallel Relations. Core identifiers are
unique across Entities, Events, and Relations.

## Decisions

### Relation identity

Changing `sourceId` and/or `targetId` updates the existing Relation. Its
Relation `id` is preserved. An endpoint pair is not the identity of a
Relation, so changing endpoints does not create a replacement object.

### Authoring scope

The first MVP remains Entity-only authoring. Endpoint selectors show Entities,
matching the existing LiaisonScape creation profile. Imported Relations with
Event endpoints remain inspectable and preservable. Their name/description
editing and deletion behavior remain unchanged; their endpoint selector is
read-only in this MVP.

This is an application limitation, not a restriction on Core-valid datasets.
Full Entity/Event endpoint editing requires a later decision and UI treatment
for Events in the graph workspace.

### Self and parallel transitions

Endpoint editing permits transitions to a self-Relation and to an endpoint pair
already used by another Relation. No endpoint-pair duplicate rejection is
added.

### Validation and stale state

The domain operation resolves the current Relation by id at commit time. The
Entity-only restriction applies only when an endpoint changes:

- A requested endpoint identical to the current endpoint is retained without
  requiring it to be an Entity.
- A changed endpoint must resolve to an Entity in the current Dataset.

Thus an imported Event→Entity or Entity→Event Relation may receive a
name/description-only update. A changed endpoint is accepted when its new ID
resolves to an Entity, including changing an Event endpoint to an Entity. Any
change to an Event endpoint is refused, including Entity→Event and
Event→Event. Missing Relation, missing changed source, and missing changed
target are refusals. A refusal returns the original Dataset and performs no
partial mutation.

The domain operation does not attempt to detect an otherwise valid old UI
draft. If an old endpoint value still exists and is a valid Entity, the domain
sees a valid requested change. Preventing stale detail drafts after Dataset or
selection changes is an App/UI responsibility.

The UI must not treat a stale detail draft as authoritative after the selected
Relation or Dataset has changed.

### Preservation and atomicity

Endpoint changes and name/description changes are applied by one atomic
immutable `updateRelation` operation. Its explicit `RelationUpdateResult`
returns the updated Dataset on success, or the original Dataset plus a reason
on refusal. At minimum, refusal reasons are `relation_not_found`,
`relation_source_entity_required`, and `relation_target_entity_required`,
consistent with creation refusal vocabulary.

The operation must preserve the Relation id, all untouched known fields,
unknown Core fields, object-local Extensions, Dataset-level data, and
Coordinate data. It must not rebuild the Relation from a minimal object.

The no-op case is valid and returns the original Dataset reference directly.

### UI boundary

`RelationDetailDialog` owns endpoint selector presentation and emits typed
draft changes. `RelationService` owns validation and Dataset mutation. `App`
continues to own drafts, selection, Dataset replacement, messages, and modal
orchestration.

## Required test-first coverage

Before browser work, add service/domain tests for source change, target change,
both changes, no-op, self transition, parallel transition, missing endpoints,
stale Relation id, refusal immutability, preserved Relation id, unknown fields,
object-local Extensions, Dataset-level data, Coordinates, and preservation of
name/description when only endpoints change. Add save/export/reopen coverage
and confirm Core validator acceptance for Entity-only results.

Imported Event endpoint cases should verify preservation and the explicit
read-only authoring boundary until Event editing is separately approved.

## Implementation gate

This decision pass authorizes test-first implementation of the Entity-only
endpoint-editing MVP. The fixed interpretation is that an Event endpoint does
not by itself block name/description editing; the Entity-only restriction
applies to endpoint authoring changes. This does not authorize GraphCanvas extraction,
Coordinate/migration restructuring, Event authoring, or any deletion behavior
change.

## Closure checkpoint

The Relation Endpoint Editing MVP is complete and closed.

- `updateRelation()` is implemented with the documented atomic domain contract.
- Domain tests cover success, self/parallel transitions, Event endpoint
  boundaries, refusal reasons, stale-state boundaries, preservation, no-op
  identity, and atomic refusal.
- The Dataset public boundary and App save orchestration are connected.
- Relation Detail provides Entity endpoint selectors only for Entity→Entity
  Relations; Event endpoint Relations remain endpoint-read-only.
- Entity and Relation detail Save actions return to the main screen on success.
- All manual acceptance items passed, including editing, self/parallel,
  cancel/close, Event endpoint preservation, delete, export, and reopen.
- Automated verification is green: 103 tests passed, lint passed, build
  passed, and `git diff --check` passed.

Direct Graph Authoring is recorded separately as a future UX workstream in
`docs/direct-graph-authoring.md`. It is not part of this checkpoint.

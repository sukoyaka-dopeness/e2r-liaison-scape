# Direct Graph Authoring — Inventory and Decision Pass

Status: `READY WITH DIRECT GRAPH AUTHORING DECISIONS`

Date: 2026-08-15

This is a non-normative future UX decision record. It does not change the E2R
Core, Coordinate responsibility, migration behavior, or the closed Relation
Endpoint Editing contract. No production behavior is authorized by this pass.

## Starting state and inventory

The inventory was performed against checkpoint
`34ac0fc docs: close internal MVP release readiness audit`.

Current relevant boundaries:

- `App.tsx` owns the cohesive graph workspace, pointer capture, node movement,
  canvas/edge panning, pinch zoom, wheel zoom, edge routing, label dragging,
  temporary positions, selection, and authoring orchestration.
- `CreationDialog` owns presentation for Entity and Relation creation, while
  `App` owns drafts and domain effects.
- `createEntity()` and `createRelation()` are the existing domain operations.
- `createRelation()` already permits self and parallel Entity Relations and
  returns explicit refusal results.
- Entity drag, canvas/edge pan, edge selection, edge-label drag, node-label
  drag, and edge-curve manipulation currently share `dragRef`, pointer capture,
  and pointer lifecycle handling.
- Existing Add Entity and Add Relation buttons must remain available.
- Temporary graph positions are distinct from explicitly saved Coordinate
  data. Opening, arranging, or creating an Entity must not auto-save
  Coordinates.

The current coupling is evidence to keep the first Direct Graph Authoring
experiment inside the existing App graph-workspace boundary. GraphCanvas
extraction is not justified by this inventory alone.

## 1. Canvas context menu

An application-owned context menu should open when the user right-clicks an
empty graph canvas area. The same menu should open after a touch long-press on
empty canvas space.

The initial canvas menu contains only:

- `Add Entity`;
- `Cancel` or dismissal by choosing outside the menu.

The existing toolbar `Add Entity` button remains unchanged.

The menu closes when the user chooses an action, clicks/taps outside it,
presses Escape, starts another pointer interaction, the Dataset is replaced,
or the menu's source gesture is canceled. A second context-menu gesture
replaces the first menu rather than creating multiple menus.

The graph surface prevents the browser's native context menu only after the
application has claimed the gesture. Browser native context menus remain
available outside the graph authoring surface.

## 2. Entity context menu

Entity right-click and long-press should use a separate Entity context rather
than the empty-canvas action set. The initial menu should be deliberately
small:

- `Edit Entity`;
- `Add Relation from Entity` with the Entity preselected as source;
- `Cancel` or dismissal.

Delete should not be added to the first context-menu experiment. Entity Detail
already exposes the guarded Danger Zone, and duplicating a destructive action
in a gesture menu increases accidental-deletion risk. Existing Relation
creation and Entity Detail flows remain available.

## 3. Add Entity at pointer position

Choosing `Add Entity` from an empty-canvas menu records the chosen graph-space
position as application state and opens the existing Entity Creation dialog.
The position is not written to the Dataset at this point.

On successful `createEntity()` completion, the new Entity receives that
position in the existing temporary `positions` state so it appears where the
user invoked the menu. The user must still use `Save node coordinates` to adopt
Coordinates into the Dataset.

Cancel, close, validation refusal, or Dataset replacement clears the pending
position and leaves both Dataset data and temporary positions unchanged. The
toolbar Add Entity path continues to use its existing placement behavior.

## 4. Connection handle

Each visible Entity may expose a small connection handle dedicated to Relation
authoring. The handle is a separate interaction target from the node body:

- node-body drag moves the Entity and never starts Relation creation;
- handle drag starts Relation authoring and never moves the Entity;
- handle click without a meaningful drag does not create a Relation.

For mouse users, the visual handle may be shown on hover or selection. For
touch users, it should be visible on the selected Entity or remain discoverable
without hover. The effective hit target should be at least approximately 24 CSS
pixels, while the visual mark may be smaller.

The handle must stop propagation before the node pointer handler claims the
gesture. A handle drag claims the pointer exclusively until completion or
cancellation.

## 5. Drag-to-create Relation

The drag-start Entity is `source`; the Entity under the valid drop target is
`target`. On a valid drop, App calls the existing `createRelation()` operation
with the selected endpoint IDs and handles its explicit success/refusal result.

The rules are:

- self Relations are allowed;
- parallel Relations are allowed;
- an empty-canvas or outside-graph drop creates nothing;
- a non-Entity drop creates nothing;
- a stale source or Dataset replacement creates nothing;
- a refused `createRelation()` result leaves the Dataset unchanged;
- Dataset mutation occurs only after a successful drop and domain result.

The preview edge during the drag is derived application state. It is never
serialized, exported, or written as Coordinate/Layout/Core data. The preview
should identify the source, current target candidate, and invalid-drop state
visually, with an explicit cancellation affordance where practical.

## 6. Gesture arbitration

The future interaction must assign one owner to a pointer sequence:

| Gesture or target | Owner | Relation-authoring outcome |
| --- | --- | --- |
| node body drag | node movement | no Relation preview |
| connection handle drag | Relation authoring | node does not move |
| empty canvas drag | canvas pan | no Relation preview |
| edge drag | existing edge/canvas behavior | no Relation creation |
| node-label drag | node-label placement | no Relation creation |
| edge-label drag | edge-label placement | no Relation creation |
| edge-curve drag | edge-curve manipulation | no Relation creation |
| wheel | zoom | no Relation creation |
| second pointer | pinch zoom | cancel Relation preview |
| right-click / long-press | context menu | no drag authoring |

Once a handle claims a pointer, node movement and canvas pan must not also
receive that sequence. Pointer capture remains with the graph surface or the
handle's owning interaction until pointerup, pointercancel, Escape, invalid
Dataset replacement, or second-pointer cancellation.

## 7. Mouse and touch behavior

Right-click and long-press are equivalent context-menu intents, but the
implementation must prevent duplicate actions:

- long-press threshold: approximately 500 ms;
- movement tolerance before canceling long-press: approximately 8 CSS pixels;
- long-press stores application state, not Dataset data;
- after a long-press menu opens, suppress the synthetic click/contextmenu
  action that would otherwise repeat the operation;
- releasing before the threshold is an ordinary pointer interaction;
- browser text selection and native touch gestures must not begin once the
  graph has claimed a context or handle gesture.

The exact threshold and tolerance are tunable application state and should be
validated on mouse, trackpad, phone, and tablet inputs. Touch handle targets
must be large enough for reliable selection without making nearby node handles
ambiguous.

## 8. Cancellation and feedback

Relation authoring cancels without Dataset mutation when:

- the pointer is released on empty canvas;
- the pointer leaves the graph without a valid Entity drop;
- Escape is pressed;
- pointercancel fires;
- a second pointer starts pinch/zoom;
- the source Entity or Dataset is no longer available;
- `createRelation()` refuses the requested endpoints.

The UI should provide immediate derived feedback: a preview line while
dragging, a valid-target indication, an invalid-target indication, and a
short refusal/cancellation message after the gesture ends. Feedback must not
imply that a Relation exists before `createRelation()` succeeds.

## 9. Architecture boundary

This workstream does not justify GraphCanvas extraction. Keep the existing
App graph workspace cohesive unless a concrete implementation experiment
demonstrates a maintenance boundary that is valuable independently of file
size.

Do not restructure Coordinate or migration code. Do not modify the Relation
Endpoint Editing contract. Do not add Core fields or Core semantics. Reuse
`createEntity()` and `createRelation()` through App orchestration and preserve
the existing service/domain boundaries.

## 10. Acceptance inventory for a future implementation

At minimum, test-first and browser acceptance should cover:

- canvas right-click opens Add Entity;
- canvas long-press opens Add Entity;
- Add Entity uses the invocation point as a temporary graph position;
- Cancel causes no Dataset mutation and clears the pending position;
- handle A→B creates one Relation;
- handle A→A creates a self Relation;
- handle A→B creates a parallel Relation when one already exists;
- invalid and empty drops cancel without mutation;
- handle drag does not move the source node;
- node drag does not create a Relation;
- pan, wheel zoom, pinch zoom, edge, label, and curve interactions regress;
- mouse and touch behavior do not duplicate actions;
- `createRelation()` refusals are surfaced without partial mutation;
- no Coordinate is auto-persisted;
- successful creation survives export and reopen;
- existing Add Entity and Add Relation buttons continue to work;
- context menus close through outside click/tap, Escape, selection,
  cancellation, and Dataset replacement.

## Decision-pass verdict

`READY WITH DIRECT GRAPH AUTHORING DECISIONS`

The interaction model is sufficiently bounded for a future test-first
implementation pass. No production behavior is changed or authorized by this
document. The next step, if approved, is to turn this inventory into a small
implementation plan and acceptance fixtures before touching production code.

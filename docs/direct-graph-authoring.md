# Future UX Candidate: Direct Graph Authoring

Status: Future workstream; not part of the Relation Endpoint Editing MVP

Direct Graph Authoring is a future LiaisonScape authoring workflow intended to
improve operation scalability as graphs grow beyond the convenience of
Source/Target dropdowns.

## Candidate interactions

- Keep the existing `Add Entity` and `Add Relation` buttons.
- Show a context menu on an empty canvas area through right-click or long
  press, including `Add Entity`.
- Consider an Entity-specific context menu through right-click or long press
  on an Entity.
- Provide a small connection handle on an Entity.
- Drag from the handle of one Entity to another Entity to create a Relation.
- Treat the drag-start Entity as `source` and the drop target as `target`.
- Continue allowing self Relations and parallel Relations under the existing
  domain rules.

Right-click and long press should be supported as equivalent context-menu
gestures. The canvas context and Entity context may expose different actions
while sharing the same interaction model.

## Domain boundary

Relation creation should continue to use the existing `createRelation()` domain
operation. This UX must not introduce new Core fields, Relation semantics, or
application-specific structural rules. Existing Entity-only authoring scope,
self-Relation behavior, parallel Relation behavior, validation, and refusal
handling remain authoritative unless a separate decision changes them.

## Motivation

The primary purpose is to provide a fast authoring path that does not depend on
Source/Target dropdowns becoming difficult to use as the number of nodes grows.
The interaction is a graph-scale usability measure, not merely a shortcut for
the existing Add Relation form.

## Design risks

The design must explicitly address gesture conflicts with:

- node dragging;
- canvas panning;
- edge selection and manipulation;
- pinch/zoom;
- touch long-press behavior;
- accidental Relation creation and cancellation feedback.

The interaction should remain usable with a mouse and on touch screens. A
long-press gesture is the touch-compatible counterpart to right-click, and it
may be offered consistently on both canvas and Entity targets.

## Scope boundary

This is an independent future UX workstream. It is intentionally excluded
from the Relation Endpoint Editing MVP and should not reopen that MVP's domain
contract or the completed architecture-cleanup workstream.

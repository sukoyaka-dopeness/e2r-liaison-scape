# Future UX Candidate: Relation Arrow Appearance

Status: Future presentation workstream; not implemented

This document records a future LiaisonScape display model. It does not change
the E2R Core or authorize a new Presentation, Layout, or Semantic Extension.

## Core structure and display appearance are independent

The Dataset should continue to preserve the Core structural direction exactly:

```json
{
  "sourceId": "A",
  "targetId": "B"
}
```

LiaisonScape may later choose how that Relation is drawn without exchanging the
Core endpoint values. Candidate arrow appearances are:

- `A → B` — forward;
- `A ← B` — reverse appearance;
- `A ↔ B` — both-direction appearance; and
- `A — B` — no arrow appearance.

A conceptual presentation value could be:

```text
arrowMode: forward | reverse | both | none
```

`arrowMode` is not a Core field. If persisted in the future, it belongs to a
Presentation/Layout-related responsibility and must not rewrite `sourceId` or
`targetId`.

The future UI may expose this as an independent Relation Detail or context-menu
control such as `Arrow: → / ← / ↔ / —`.

## Relation multiplicity remains independent

Parallel Relations must remain separate Core Relations with separate IDs and
separate editable data. For example:

```text
R1: A — B   "parent-child"
R2: A — B   "teacher-student"
```

The two Relations may later have different arrow appearances:

```text
R1: A ← B
R2: A → B
```

or:

```text
R1: A ↔ B
R2: A → B
```

This preserves independent names, descriptions, Semantic/Dictionary data,
provenance, and other Extension data. A `↔` appearance does not imply that two
Core Relations exist. Conversely, two Core Relations with opposite structural
directions do not require LiaisonScape to collapse them into one visual
Relation.

The guiding distinction is:

```text
Relation multiplicity = how many relationship facts exist in the Dataset
Arrow appearance      = how one Relation is represented on screen
```

Core direction remains structural, while its meaning is not defined by the
Core. Presentation may therefore vary without changing Core facts.

## Relationship to future authoring UX

This model complements `docs/direct-graph-authoring.md`. A future authoring
flow could be:

1. create a Relation between two Entities;
2. choose its arrow appearance independently; and
3. create or edit additional parallel Relations between the same nodes.

Right-click/long-press menus and Relation Detail are possible controls, but
gesture design, persistence responsibility, and Presentation/Layout schema
require separate decisions.

## Explicit non-goals

- Do not swap `sourceId` and `targetId` for a visual Reverse action.
- Do not infer semantic meaning from arrow appearance.
- Do not merge parent-child and teacher-student Relations into one
  bidirectional Relation.
- Do not treat `↔` as evidence of Relation multiplicity.
- Do not add `arrowMode` to the Core during current MVP work.

# Future Design Exploration: Group / Cluster

Status: `future design exploration / problem framing`

This document records a research direction only. It is not an accepted schema
decision and authorizes no production, Core, Extension, Validator, migration,
or release-scope change.

## WHY / Motivation

LiaisonScape currently authors Entity and Relation graphs directly. Larger
relationship graphs may benefit from grouping several nodes for comprehension,
comparison, and navigation. A group may also need to participate in a Relation
as a targetable subject, while a visual cluster may exist only for one
Perspective or investigation.

The central question is whether these are one concept or two:

- a semantic, targetable Group with identity and meaning;
- a visual Cluster used to compose a particular view.

They must not be conflated merely because both can draw a boundary around
multiple Entities.

## User requirements

Future exploration should consider:

- grouping many Entities without replacing their identity;
- allowing a semantic Group to participate in Relations;
- visual grouping that can overlap or nest;
- group-level Relations remaining distinct from member-level Relations;
- collapsed and expanded representations without changing endpoints;
- explicit, understandable labels for Group, Cluster, and Container;
- large membership sets without automatically creating all pairwise Relations.

## Existing E2R constraints

The current E2R Core remains authoritative:

- Core objects are Entity, Event, and Relation;
- Relation direction is structural;
- Relation endpoints may be Entity or Event;
- Relations cannot target Relations;
- self and parallel Relations are allowed;
- Core does not assign domain meaning to Relation `type`.

No new Core `Group` object is proposed by this exploration. A semantic Group
may be represented as an ordinary Entity in one candidate, but that is not yet
an accepted application contract.

## Semantic Group vs Visual Cluster

### Semantic / targetable Group

A semantic Group has identity, name, description, and meaning in the Dataset or
an explicitly defined semantic layer. It may be a Relation endpoint, such as a
team, department, family, coalition, or organization. Membership is a fact
that needs an explicit representation and provenance.

### Visual Cluster

A Visual Cluster is a Perspective-owned presentation grouping: for example,
an investigation set, selected suspects, or entities relevant to a chapter.
It may be temporary, overlapping, nested, or view-specific, and may not need
to be a Relation endpoint.

The same semantic Group may be referenced by a visual Cluster, but visual
containment must not be treated as proof of semantic membership.

## Candidate representation models

### Candidate A: Group as an ordinary Entity

Represent a semantic Group as an Entity and represent membership separately.

Benefits include existing Core interoperability, Relation endpoint support,
identity, names, descriptions, nested Entity-level representation, and no new
Core object type.

Risks include unclear membership ownership and the danger of treating every
visual cluster as a semantic Entity.

### Candidate B: Perspective-owned grouping only

Represent all grouping as Perspective Grouping. This keeps visual
responsibility clear and supports overlap and nesting, but cannot satisfy use
cases requiring a Group itself to be a Relation endpoint.

### Candidate C: Semantic Group Entity plus Visual Cluster separation

Use an Entity for targetable semantic Groups and Perspective Grouping for
visual composition. A Cluster may reference or present a Group without
becoming the Group. This is the current leading candidate for further research,
not an accepted decision.

### Candidate D: Additional responsibility or Extension

Introduce a separate grouping responsibility only if the preceding candidates
cannot express the required semantics. Any such work would require an explicit
Extension and interoperability decision; it must not silently add a Core type.

## Membership representation candidates

Membership could be represented as Relations, Perspective Grouping membership,
or a dedicated future responsibility. These have different storage, rendering,
and semantic costs.

If membership uses Relations, N members means N membership Relations, not
N × (N - 1) pairwise Relations. Membership Relations must remain distinct from
ordinary group-level Relations, and LiaisonScape need not always render every
membership edge as a normal visible edge.

Using Relation `type` alone to define membership is not yet considered
sufficient; Semantic or Dictionary responsibilities may be required.

## Group as a Relation endpoint

A semantic Group may be a Relation endpoint in a candidate model:

```text
Alice      -- supports --> Team A
Team A     -- allied with --> Organization B
Organization -- owns --> Group
```

A Group-level Relation must not be automatically expanded into one Relation
per member. Group-level and member-level Relations are separate facts with
separate IDs, descriptions, and provenance.

## Nested and overlapping Groups

Future research must distinguish semantic nesting from visual nesting. It must
consider arbitrary nesting, cycles, self-membership, and whether membership
cycles are refused, warned about, or allowed by the responsible layer.

Overlapping membership is expected to be valid: one Entity may belong to
multiple Groups. Visual options include overlapping boundaries, nested
containers, contours, brackets, labels, proxy nodes, and multiple Perspective
views. No single visual representation is selected here.

## Collapsed / expanded representation

Collapse and expand should be Presentation or Perspective state. Collapsing a
Group must not delete or rewrite membership facts, change Relation endpoints,
or silently convert group-level Relations into member-level Relations.

The identity of a Group and the identity of every member must remain stable
across visual expansion states.

## Visual representation candidates

Candidates for later evaluation include boundary regions, nested containers,
contours, bracket-like groupings, background regions, outline styles, labels,
membership badges, proxy nodes, and duplicated visual projections. Color alone
should not carry the semantics. Any visual duplication must be evaluated for
Entity identity and selection ambiguity.

## Layout / Coordinate boundary

Group movement, collapse, spacing, and containment are Layout or Perspective
concerns unless an explicit future Coordinate contract says otherwise. Moving
a visual container must not silently rewrite member Coordinates. Temporary
group layout and explicit Coordinate persistence must remain separate.

## Perspective relationship

Perspective Grouping is the natural responsibility for view-specific clusters,
overlap, nesting, selection sets, and temporary visual composition. A future
semantic Group may be presented through one or more Perspectives, but the
Perspective must not silently create or infer semantic membership.

## Interoperability considerations

Future work should evaluate:

- whether other E2R applications can read a semantic Group as an Entity;
- preservation of unknown Group-specific or Perspective data;
- round-trip behavior for opaque grouping data;
- whether LiaisonScape-only visual state remains outside the Core Dataset;
- how NarrativeLine and other applications present Group Entities.

## Risks / anti-goals

This exploration does not authorize:

- a new Core Group object;
- requiring every Group to be an Entity or every membership to be a Relation;
- treating every visual Cluster as semantic membership;
- automatic expansion of Group Relations to member Relations;
- automatic grouping inference or AI-generated membership;
- forced Venn-diagram visualization;
- Coordinate persistence or migration changes;
- Validator, schema version, or Extension identifier changes;
- public release scope changes.

## Open decisions

- Is Candidate C sufficient for targetable Groups and visual Clusters?
- What layer owns semantic membership and its vocabulary?
- Are membership Relations ordinary visible edges, filtered edges, or a separate
  presentation category?
- What nesting and cycle policy is appropriate?
- How should overlapping membership be presented without identity ambiguity?
- How should collapsed Group Relations remain discoverable?
- Are Events eligible for membership, or is that a later question?
- Which terms—Group, Cluster, Container—should be user-facing?

## Recommended next research steps

1. Compare Candidate A and Candidate C against concrete Group-level Relation
   scenarios.
2. Define membership fact, visual membership, and group-level Relation as
   separate examples.
3. Prototype overlapping and nested presentation without changing the Dataset.
4. Test collapsed/expanded identity and Relation endpoint stability.
5. Review interoperability with Core-only consumers before any implementation
   proposal.

## Non-authorization statement

This is a future design exploration. It does not authorize production behavior,
Core schema, Extension, Validator, migration, Coordinate, or UI changes.


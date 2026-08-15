# LiaisonScape MVP / Release-Readiness Audit

Status: `INTERNAL MVP READY / FIRST DISTRIBUTION DEFERRED`

Audit basis: `2f237a3 feat: complete Relation endpoint editing MVP`

This is a non-normative product audit. It does not change the E2R Core or any
Extension specification. No production behavior was changed during this
audit.

## Repository and verification state

LiaisonScape was verified at checkpoint `2f237a3` with a clean worktree before
the audit.

- LiaisonScape tests: 103 passed / 0 failed
- LiaisonScape lint: passed
- LiaisonScape build: passed
- LiaisonScape `git diff --check`: passed
- Manual Relation Endpoint Editing MVP acceptance: passed and closed

NarrativeLine was inspected for interoperability evidence. Its current
worktree contains pre-existing user changes and was not modified by this
audit. Its verification on that state passed:

- NarrativeLine tests: 42 passed / 0 failed
- NarrativeLine lint: passed
- NarrativeLine build: passed

## Audit matrix

### 1. Core authoring completeness — PASS

The current LiaisonScape implementation and acceptance evidence cover:

- Entity creation, detail editing, and safe deletion;
- Relation creation, detail editing, deletion, and endpoint editing;
- self and parallel Relations;
- Relation identity preservation on endpoint changes;
- imported Event endpoint preservation;
- atomic refusal and preservation of unknown fields and Extensions.

The application remains intentionally Entity-first. It does not create or
edit Events, and it does not present Event endpoints as ordinary graph nodes.
These are documented application boundaries rather than Core limitations.

### 2. Dataset safety and interoperability — PASS

Evidence covers Dataset open, Core validation before export, export/reopen,
unknown Core field and Extension preservation, Core identifier preservation,
Coordinate preservation, and separate handling of validation errors versus
unsupported application features.

NarrativeLine provides passing round-trip evidence for shared fixtures,
unknown Extensions, Source/Citation data, Names data, and Coordinate data.
The NarrativeLine worktree state is dirty, so this result is verification
evidence rather than a new clean checkpoint.

### 3. Coordinate and graph workspace — PASS

The graph workspace covers temporary fallback positions, stored Coordinate
priority, node dragging, explicit coordinate saving, zoom/pan, pinch zoom,
routing, self/parallel edge display, label and route adjustments, and the
existing migration tests. View state remains outside the Dataset.

Coordinate migration is deliberately narrow and atomic. Unsupported or
unknown Coordinate profiles remain preserved rather than guessed.

The user guides now describe the current Relation endpoint and Coordinate
boundaries. Migration controls remain a first-distribution wording decision,
not an internal-MVP implementation blocker.

### 4. Pre-release legacy cleanup — DEFERRED TO FIRST-DISTRIBUTION PREP / NOT AN INTERNAL-MVP BLOCKER

The product still contains three migration paths and corresponding UI for
Prototype→Draft, Linkscape-space→LiaisonScape-space, and oldest legacy
Linkscape→LiaisonScape migration. They are tested and intentionally
preservation-oriented.

Because LiaisonScape has not yet been distributed to external users, these
paths have not become an external compatibility promise. The decision is:

- `DEFERRED TO FIRST-DISTRIBUTION PREP / not an internal-MVP blocker`.
- Keep the tested migration behavior and current UI during internal MVP work.
- At first-distribution preparation, make the final `KEEP` or `REMOVE BEFORE
  RELEASE` decision with the intended audience and compatibility promise in
  view.
- Do not add further migration UX polish during unrelated work.
- If removed before first distribution, retain the migration code/tests or
  archive the compatibility decision and fixtures deliberately rather than
  deleting them casually.

This is not currently a data-safety blocker or an internal-MVP blocker. It
must be resolved before the first public or private handoff.

### 5. Product UX and documentation — PASS WITH FIRST-DISTRIBUTION REVIEW

The main authoring and destructive-action flows are implemented and manually
accepted, including confirmation UI, Danger Zone behavior, modal Save/Cancel,
and keyboard focus containment.

The English and Japanese LiaisonScape user guides now describe the completed
Relation endpoint editing boundary: Entity→Entity selectors are available;
imported Event endpoints are preserved and endpoint-read-only; and
name/description editing remains available.

The migration controls and their developer-oriented Linkscape terminology also
need a final product decision and wording review before distribution.

### 6. Release boundary — PASS WITH EXPLICIT POST-MVP QUEUE

The following are not MVP blockers and remain outside this audit's
implementation scope:

- Direct Graph Authoring;
- Event creation or editing;
- semantic Relation types;
- Layout/Perspective standardization;
- Undo/Redo;
- search/filtering and graph clustering;
- on-demand external provider research;
- AI-generated names, descriptions, or layouts.

Direct Graph Authoring is recorded in
`docs/direct-graph-authoring.md` as a future UX workstream. It must not be
selected or implemented as part of this release-readiness audit.

## Release preparation actions

Before handing LiaisonScape to another person:

1. During first-distribution preparation, decide whether the legacy migration
   UI is `KEEP` or `REMOVE BEFORE RELEASE`; until then it is deferred while
   tested behavior is preserved.
2. Review migration labels, refusal messages, and first-import UX with that
   decision applied.
3. Re-run the full LiaisonScape and NarrativeLine verification gates from clean
   checkpoints after documentation or release-scope changes.

## Final audit verdict

`INTERNAL MVP READY / FIRST DISTRIBUTION DEFERRED`

No internal MVP blocker remains in the audited LiaisonScape boundary. This
does not declare first-distribution readiness. Friend-facing first
distribution remains deferred until Direct Graph Authoring and the planned
application UI Japanese localization are complete.

## Internal MVP closure

The LiaisonScape internal MVP audit is closed at the Relation Endpoint Editing
checkpoint lineage beginning with `2f237a3 feat: complete Relation endpoint
editing MVP`.

The following are explicitly deferred beyond this audit:

- Legacy migration UI final `KEEP` / `REMOVE BEFORE RELEASE` decision, deferred
  to First-Distribution Prep and not an internal-MVP blocker;
- Direct Graph Authoring, including its future Inventory and Decision Pass;
- application UI Japanese localization;
- Relation Arrow Appearance as a future presentation workstream.

These deferred items do not reopen the completed Relation Endpoint Editing
contract, Core specification, Coordinate responsibility, or migration
behavior.

## Next workstream candidate

`Direct Graph Authoring — Inventory and Decision Pass`

The next workstream must begin with design and audit only. It must not change
production behavior during the Decision Pass. The inventory should cover:

- canvas right-click and long-press context menus;
- Entity right-click and long-press context menus;
- connection-handle drag for Relation creation;
- drag-start Entity as source and drop Entity as target;
- self and parallel Relations;
- preservation of existing Add Entity and Add Relation buttons;
- conflicts among node drag, canvas pan, pinch, and edge manipulation;
- mouse and touch behavior;
- cancellation and accidental-creation feedback;
- whether canvas Add Entity uses the click position as a temporary graph
  position;
- preservation of the rule that Coordinate data is not automatically saved;
- reuse of `createRelation()` and `createEntity()`;
- no changes to Core, Coordinate, migration, or Relation Endpoint Editing
  contracts.

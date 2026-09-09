# LiaisonScape Presentation Locality Correction Experiment

Status: bounded local experiment. This is not Product adoption, formal visual acceptance, or governed evidence.

## Starting snapshots

- `d773ad8` = known-good bounded label-route fallback.
- `a38e01f` = user-inspected promising node-label yielding snapshot.
- `98d10e0` = output-preserving label-free counterfactual reuse.

The experiment preserves the `a38e01f`/`98d10e0` presentation semantics and
tests only whether safe, non-incident automatic routes can retain their prior
geometry during an active local Node drag.

## Correction candidate

Changed paths:

- `src/App.tsx`
- `src/graph-presentation.ts`
- `src/viewport.ts`
- `tests/graph-presentation.test.ts`

During an active Node drag, the App supplies the previous automatic route set.
For a non-incident, non-parallel, non-self, non-manual route, the previous route
is reused only when all of the following hold:

- the prior route has no current unrelated-node influence;
- it does not conflict with already occupied current paths;
- it does not collide with current provisional label rectangles.

Otherwise the ordinary route candidate is retained. The previous route set is
cleared when a new Dataset is accepted, and no saved Dataset or evidence
artifact is changed.

This is a continuity candidate, not a rule that unrelated routes must never
move. Route safety and label safety retain authority over continuity.

## Apollo 11 diagnostic result

Using the same Apollo 11 `spacing=220` fixture and a 50 graph-unit move:

| Drag | Non-incident route changes | Estimated crossings before → after | Remaining remote flip |
| --- | ---: | ---: | --- |
| Saturn V | 5 → 1 | 3 → 2 | `entity-4` |
| NASA | 1 → 1 | 3 → 6 | `entity-5` |

The previous Saturn V diagnostic found that the five original remote route
changes were outside direct 60-unit node influence. The candidate suppresses
four of those changes. The remaining Saturn V route and the NASA route are
blocked from continuity by downstream presentation dependencies (especially
label/route safety), and remain unresolved rather than being forced stable.

The crossing estimate is a diagnostic sampled-route comparison, not an
optimization target or formal acceptance signal. In particular, the NASA case
shows why locality cannot be judged by remote-change count alone: fewer changes
do not guarantee better visual output.

For the same Apollo 11 fixture, a warm pure-function active-drag benchmark
measured `79.545 ms` median / `85.165 ms` p95 with the continuity candidate,
compared with `81.331 ms` median / `87.132 ms` p95 without supplying a previous
route set. This comparison is local implementation timing only; it does not
establish browser FPS or pointer latency.

## Actual Product check

The real Product surface was inspected at:

`http://127.0.0.1:4175/e2r-liaison-scape/experimental/product-evaluation-seam/actual-inspection/?spacing=220`

Physical Saturn V and NASA drags were performed through the actual Product
surface. The route diagnostic and temporary coordinate state updated during
each drag. No coordinate save was performed; reloading restored the fixture.
No obvious visible freeze was observed in these bounded interactions, but
browser FPS and pointer-to-render latency remain unmeasured.

## Decision

The candidate is retained as an inspection candidate, not selected for final
spacing/routing adoption. It demonstrates that some remote churn is caused by
route-order continuity rather than direct obstacle safety, while the NASA
crossing increase demonstrates that continuity must remain conditional.

The next useful checkpoint is user comparison of the actual Product behavior:

- whether the preserved remote routes feel more stable during Saturn V drag;
- whether the remaining flip/crossing in NASA drag is visually harmful;
- whether route recovery and label yielding still feel natural;
- whether any responsiveness difference is noticeable during repeated drag.

Cross-sample audit, crossing-aware placement, parallel/self-loop redesign,
spacing selection, and governed Fresh execution remain out of scope.

## Validation and boundaries

- `npm test`: `315/315 PASS`.
- lint: PASS.
- build: PASS.
- `git diff --check`: PASS.
- Fresh10/Fresh11/Fresh12 historical evidence and the canonical Fresh12 review result: unchanged.
- New governed Fresh lineage: NOT STARTED.
- Push, tag, release, deploy, and publication: NOT PERFORMED.

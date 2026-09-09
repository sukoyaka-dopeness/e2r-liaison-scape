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
No obvious visible freeze, edge hysteresis, or snap-back was observed in these
bounded interactions. A later dev-only timing seam measured the current
`2ccbb34` surface as follows:

| Drag | Pointer moves | Presentation computations | Presentation median / p95 / max | Pointer→sampled render median / p95 / max | Pointer→node lag median / p95 / max |
| --- | ---: | ---: | ---: | ---: | ---: |
| Saturn V | 8 | 16 | 79.0 / 121.0 / 143.8 ms | 1.1 / 1.2 / 1.3 ms | 6.3 / 6.3 / 6.3 px |
| NASA | 8 | 16 | 83.7 / 101.6 / 141.0 ms | 1.0 / 1.1 / 1.2 ms | 6.3 / 6.3 / 6.3 px |

The measurement seam records the real Product `pointermove`, the node-body
rendered center, and a two-`requestAnimationFrame` DOM sample. It is a
bounded sampled latency signal, not browser FPS or a complete event-queue
trace; dropped/coalesced events and Long Task attribution were not measured.
The presentation duration is captured around the actual `App` presentation
derivation. It should therefore be compared with the pure-function benchmark,
but not treated as a frame-rate guarantee.

The enhanced end-to-end diagnostic seam then added processed-pointer timing,
event timestamp age, processing age, coalesced samples, latest-versus-processed
pointer distance, and Long Task observation. It produced these current-surface
measurements:

| Drag | Presentation median / p95 / max | Pointer→sampled render median / p95 / max | Processed pointer→render median / p95 / max | Event age / processing age median | Latest-vs-processed max | Coalesced |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Saturn V | 896.8 / 1188.9 / 1259.6 ms | 4.2 / 8.4 / 10.6 ms | 3.7 / 6.0 / 7.2 ms | 2365.9 / 2366.3 ms | 0.0 px | 8 |
| Saturn V (warm repeat) | 852.3 / 1056.8 / 1220.6 ms | 4.2 / 8.0 / 9.0 ms | 3.8 / 4.3 / 5.7 ms | 2211.1 / 2211.6 ms | 0.0 px | 8 |
| NASA | 908.7 / 1148.2 / 1177.0 ms | 4.6 / 4.9 / 5.4 ms | 1.4 / 4.3 / 4.9 ms | 2337.2 / 2338.0 ms | 0.0 px | 8 |

Long Tasks overlapping the diagnostic intervals included approximately
`1.7–2.6 s` entries. The earlier approximately-1-ms value therefore measured
only latest captured `pointermove` to a two-rAF DOM sample; it did not measure
event age, React processing, or presentation derivation. These are page-observed
diagnostic signals, not physical-input latency or acceptance metrics. Event
injection, host/browser scheduling, and tasks that began before the gesture can
affect them; the Long Task observer is not a precise attribution profiler.

The historical `a38e01f` and `98d10e0` surfaces were also opened in isolated
temporary worktrees and received one physical Saturn V and one physical NASA
drag each under the same fixture and viewport. Both completed with no obvious
visible freeze or snap-back. Those historical surfaces did not contain the
timing seam, so their physical checks are qualitative only. One `98d10e0`
NASA action had a longer automation completion wait than the other bounded
actions; because this was a single helper-level observation without in-page
timing, it remains unresolved rather than being attributed to Product lag.

## Pointer responsiveness diagnosis

### Proven

- `a38e01f` is the first of these snapshots that adds the label-yielding
  route-free counterfactual and can trigger a bounded second presentation pass.
  The existing warm pure-function benchmark rises from `26.7 ms` median before
  it to `101.9 ms` median at `a38e01f`.
- `98d10e0` hoists and reuses the label-free counterfactual without changing
  presentation output. Its warm pure-function median is `76.9 ms`.
- `2ccbb34` adds conditional previous-route validation during active Node drag.
  Its warm pure-function active-drag comparison was `79.545 ms` median / `85.165
  ms` p95 with the previous route set versus `81.331 ms` / `87.132 ms` without
  it.
- On the current actual Product surface, the sampled pointer-to-render signal
  remained about `1 ms` and normalized pointer-to-node lag was about `6.3 px`
  for both representative drags. The node visibly followed the pointer in the
  bounded checks.
- The enhanced seam observed no spatially newer pointer sample waiting behind
  the processed sample in the captured drags: latest-versus-processed pointer
  distance was at most `0 px`. This rules out a spatial backlog in those
  observations, but does not identify the source of the user-visible delay.
- The same seam observed event timestamps roughly `2.2–2.4 s` old at
  processing and presentation derivation durations roughly `0.85–1.26 s`
  median/max in the current dev session, with Long Tasks overlapping the
  interval. These are real page-observed runtime signals, not evidence of a
  particular physical input device or browser subsystem.

### Strongly supported

- The principal computational regression risk enters with `a38e01f`, not with
  the locality branch itself: its extra route/label work explains the large
  pure-function increase, while `98d10e0` recovers a substantial part of that
  cost without changing the visual result.
- `2ccbb34` did not show a meaningful additional computation penalty in either
  the pure benchmark or the current in-page timing samples. It is therefore
  unlikely to be the primary source of the previously perceived pointer lag.
- The current large in-page derivation and Long Task observations support a
  synchronous main-thread/runtime contribution, but do not distinguish Product
  work from Edge, Vite development runtime, or automation scheduling.
- A safe future responsiveness correction would likely need to separate an
  immediate node visual position from expensive route/label derivation, allow
  intermediate work to be superseded, and force one authoritative full
  presentation at drag end. That is only a candidate direction: it risks
  stale routes, labels, or snap-back and needs a controlled A/B plus user
  inspection before implementation.

### Unresolved

- A causal physical latency ranking between the historical snapshots cannot be
  established from one qualitative drag per node because only the current
  snapshot has the timing seam.
- Whether the large event age is caused by the Product, CUA injection, Edge,
  Vite development runtime, or their interaction remains unresolved. The
  timestamp-age signal alone must not be read as physical input latency.
- Browser FPS and precise Long Task attribution remain unresolved. Historical
  snapshots lack equivalent instrumentation, so the current measurements do
  not establish an A/B regression across `a38e01f`, `98d10e0`, and `2ccbb34`.
- The remaining remote route flip and NASA crossing change are presentation
  locality questions, not evidence that the current pointer-tracking path is
  lagging.

## Responsiveness correction candidate

The bounded correction keeps the existing route/label derivation semantics but
changes the scheduling boundary for an active Node drag:

- the latest dragged Node position is kept in a lightweight live-drag state so
  the Node visual can follow the pointer without waiting for route derivation;
- route and label `positions` are updated at most once per animation frame,
  with only the latest pending position retained;
- the bounded final-label feedback pass is disabled during the active Node
  drag, avoiding a second expensive derivation for the same pointer update;
- the pending position is flushed on pointer end, and a revision-triggered
  render runs the full feedback pass after `dragRef` is cleared.

The live Node and its labels use the same drag delta, so deferred route/label
geometry does not create a label jump. Routes can be at most one frame behind
the live Node during the drag; the drag-end flush prevents stale final geometry
or a snap-back from becoming authoritative. Manual route and label authority
remain unchanged.

The user-provided pre-correction physical run was `30` pointermoves,
`52` presentation computations, `72.9 ms` presentation median, `12.0 / 24.0 /
29.4 px` pointer-to-node lag median/p95/max, `179.3 ms` pointer-to-render p95,
and `26` Long Tasks around `152–192 ms`. A bounded CUA smoke run after the
correction produced `8` pointermoves and `12` recorded presentation samples;
Saturn V measured `541.4 / 750.6 / 789.7 ms` presentation median/p95/max,
`5.0 / 5.0 / 10.0 px` pointer-to-node lag median/p95/max, and `1.1 ms`
pointer-to-render p95. The CUA run also observed very large host/runtime Long
Tasks, so it is not a controlled numerical A/B against the user run. Its value
here is the actual Product smoke result: the Node followed the gesture and no
obvious visible freeze, route hysteresis, label jump, or drag-end snap-back was
seen. User inspection remains required before adoption.

## Decision

The candidate is retained as an inspection candidate, not selected for final
spacing/routing adoption. It demonstrates that some remote churn is caused by
route-order continuity rather than direct obstacle safety, while the NASA
crossing increase demonstrates that continuity must remain conditional.

The responsiveness change is a bounded local candidate, not a final Product
adoption. The next useful checkpoint is user comparison of the actual Product
behavior:

- whether the preserved remote routes feel more stable during Saturn V drag;
- whether the remaining flip/crossing in NASA drag is visually harmful;
- whether route recovery and label yielding still feel natural;
- whether any responsiveness difference is noticeable during repeated drag.

The timing instrumentation is intentionally dev-only and diagnostic. No
additional drag-time coalescing policy or locality redesign is selected yet.
The current correction must first pass user inspection for pointer feel and
visual continuity. A controlled same-browser comparison remains useful if the
user still perceives lag, especially one that separates event injection from
synchronous presentation work.

Cross-sample audit, crossing-aware placement, parallel/self-loop redesign,
spacing selection, and governed Fresh execution remain out of scope.

## Validation and boundaries

- `npm test`: `316/316 PASS`.
- lint: PASS.
- build: PASS.
- `git diff --check`: PASS.
- Fresh10/Fresh11/Fresh12 historical evidence and the canonical Fresh12 review result: unchanged.
- New governed Fresh lineage: NOT STARTED.
- Push, tag, release, deploy, and publication: NOT PERFORMED.

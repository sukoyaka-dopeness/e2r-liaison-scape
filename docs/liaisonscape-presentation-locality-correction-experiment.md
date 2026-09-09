# LiaisonScape Presentation Locality Correction Experiment

Status: bounded local experiment. This is not Product adoption, formal visual acceptance, or governed evidence.

## Starting snapshots

- `d773ad8` = known-good bounded label-route fallback.
- `a38e01f` = user-inspected promising node-label yielding snapshot.
- `98d10e0` = output-preserving label-free counterfactual reuse.
- `06913e2` = user-observed responsiveness improvement candidate; not Product adoption.

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

## User observation and computation breakdown

The user subsequently reported that `06913e2` may have restored a closer,
more synchronous pointer-to-Node feel. That observation is retained as
promising Product evidence, while the user-side tail remains unresolved:

| Signal | User-side measurement after `06913e2` | Pre-correction measurement |
| --- | ---: | ---: |
| Pointer moves / raw presentation computations | 89 / 166 | 30 / 52 |
| Presentation median / p95 / max | 45.6 / 58.0 / 89.3 ms | 72.9 ms median |
| Pointer-to-Node lag median / p95 / max | 5.8 / 79.6 / 179.1 px | 12.0 / 24.0 / 29.4 px |
| Pointer-to-render p95 | 120.2 ms | 179.3 ms |
| Event age median | 10.5 ms | not recorded |
| Latest-versus-processed pointer max | 0.0 px | not recorded |
| Coalesced samples | 503 | not recorded |
| Long Tasks | approximately 89–161 ms, numerous | approximately 152–192 ms × 26 |

The enhanced diagnostic then classified one actual Product CUA drag as `12`
raw presentation samples from `6` unique `positions` identities, with `6`
duplicate computations, `0` feedback passes, and `8` pointermoves. Both
actual inspection entry points run the App under React `<StrictMode>`; the
unique/duplicate split therefore strongly supports development StrictMode
render-phase re-invocation as the explanation for much of the apparent
`166 > 89` multiplicity. The raw count must not be treated as production
presentation work. The route/label first pass and rAF position flush remain
necessary work; the deferred feedback pass was not observed during the active
drag.

The user-side `79.6 / 179.1 px` tail cannot yet be called visible lag. The
zero latest-versus-processed distance argues against an input-position backlog,
while the lower pointer-to-render p95 and the user's improved median feel argue
that the common path improved. The tail may be caused by Long Task intervals,
stop/reversal sampling, or the sampling point itself. Current diagnostics do
not prove which; user inspection is required. In the CUA classification run,
the available samples fell outside recorded Long Task windows, so no causal
lag correlation was claimed.

Presentation medians near `45.6 ms` together with `89–161 ms` Long Tasks are
consistent with duplicated development render work plus React commit/paint or
runtime scheduling, but do not prove that all Long Task time is Product
presentation work. The next diagnostic boundary is a production-like build or
non-StrictMode inspection run, not more locality logic.

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

## Production-like StrictMode comparison

The actual inspection seam now accepts `strictMode=off`. This keeps the real
`src/App.tsx`, the real Apollo 11 fixture, and the real node-drag path, while
omitting only the diagnostic seam's React development `<StrictMode>` wrapper.
The Vite development server remains in use, so this is a production-like
comparison surface, not a release-build performance claim. The visible seam
label identifies the mode to prevent the two runs from being confused.

The current development CUA classification had `12` raw presentation samples
from `6` unique position identities, `6` duplicate computations, and `0`
feedback passes. Two bounded drags on the StrictMode-off surface produced:

| Drag | Raw / unique / duplicate | Presentation median / p95 / max | Pointer-to-render median / p95 / max | Node lag median / p95 / max | Event age median | Long Tasks |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Saturn V | 5 / 5 / 0 | 698.7 / 713.8 / 782.6 ms | 1.4 / 1.5 / 1.9 ms | 5.0 / 10.0 / 10.0 px | 795.2 ms | 86, 815, 787, 993, 829 ms |
| NASA | 6 / 6 / 0 | 519.0 / 613.4 / 837.6 ms | 1.3 / 1.5 / 1.7 ms | 5.0 / 5.0 / 5.0 px | 712.7 ms | 57, 122, 896, 713, 933, 887 ms |

These CUA measurements are diagnostic only and are not a controlled numerical
A/B against the user's physical-input sample. They prove that the duplicate
computation classification disappears when the wrapper's StrictMode is off;
they do not prove that the remaining Long Tasks or event age belong to Product
presentation work. The very large automation/runtime intervals and the low
pointer-to-render/node-lag samples are internally inconsistent with treating
the raw elapsed time as physical pointer latency. The result supports keeping
`06913e2` as the current responsiveness candidate without another correction.

### Comparison conclusion

- Development duplicate computations: CONFIRMED; the StrictMode-off run had
  none.
- Production-like actual Product responsiveness: not contradicted by the
  bounded smoke run; the Node followed both gestures without visible freeze or
  snap-back.
- Long Tasks: observed in both diagnostic contexts, but their Product versus
  Vite/Edge/CUA attribution remains UNRESOLVED.
- Release-build responsiveness and a controlled physical same-browser A/B:
  UNRESOLVED.

No further drag-performance correction is selected from this checkpoint.
Routing/label yielding, remote route propagation, and route-flip behavior stay
separate presentation questions.

## Pointer-up route continuity correction

The production-like actual inspection reproduced the relevant boundary. Before
the correction, a bounded Saturn V drag reported changes in
`entity-6, entity-7, entity-8, entity-10, entity-11` between the last observed
drag-time snapshot and pointer-up. That particular CUA trace did not have the
same final node geometry in both snapshots because the final flush and the
diagnostic sampling point are separate; it therefore did not by itself prove
that every change was gratuitous.

The pure Product presentation comparison removed that ambiguity. With the
same final positions and the active route map as the previous-route input,
removing `draggedNodeId` changed eight routes. Keeping the continuity boundary
but enabling final feedback changed only three routes. This establishes that
pointer-up was not merely displaying the live position late: it was changing
the route-arbitration state.

### Root cause

`endGraphPointer()` flushed the latest Node position and scheduled the final
presentation, then cleared `dragRef`. The next `App` presentation therefore
passed no `draggedNodeId` to `deriveAutomaticRoutes()`. Its existing
previous-route preservation is intentionally conditional on that ID, so
non-incident routes were eligible for a fresh occupied-path/label-obstacle
arbitration at pointer-up. The final bounded label-feedback pass could further
change the route input. Incident routes must still be allowed to reroute because
their endpoint geometry changed.

### Bounded correction

`App` now retains the completed Node's ID in a ref for exactly the one
pointer-up presentation. The final presentation keeps feedback enabled and
continues to use the existing safety checks: previous routes are reused only
when they remain clear of Node influence, occupied paths, and final label
rectangles. The ref is cleared by the presentation effect without scheduling a
second route recomputation. This preserves safe non-incident continuity while
leaving incident and newly unsafe routes authoritative to reroute.

The post-correction actual Product trace changed only incident routes:

| Drag | Routes changed at pointer-up | Interpretation |
| --- | --- | --- |
| Saturn V | `entity-8`, `entity-10` | Both are incident to Saturn V; allowed reroute |
| NASA | `entity-1`, `entity-2`, `entity-3`, `entity-8` | All are incident to NASA; allowed reroute |

This is a bounded interaction correction, not a change to spacing, route
scoring, curvature limits, or crossing-aware placement.

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

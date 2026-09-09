# LiaisonScape `a38e01f` Snapshot Diagnosis

Status: local diagnostic record. This is not Product adoption, formal visual acceptance, or governed evidence.

## Snapshot position

- `d773ad8` remains the known-good bounded label-route fallback.
- `a38e01f` is a user-inspected promising snapshot for Apollo 11 wide control.
- The user reported that route recovery and node-drag feel were substantially improved, with no observed ownership-popover residue during repeated node drags.
- The snapshot is preserved as a comparison point; no new Fresh lineage is started.
- The bounded counterfactual-reuse correction is a local follow-up to this
  snapshot. It preserves the snapshot output while reducing duplicate
  computation; it is not a spacing, routing, or locality adoption decision.

The actual Product inspection surface used for the local check was:

`http://127.0.0.1:4175/e2r-liaison-scape/experimental/product-evaluation-seam/actual-inspection/?spacing=220#datasetUrl=https%3A%2F%2Fdiagnostic.liaisonscape.invalid%2Fapollo-11-product-inspection.en.e2r.json`

## Diagnosis

### Proven

1. `a38e01f` keeps the existing bounded presentation pipeline and adds a route-free counterfactual for each route. A route that changes materially when provisional node labels are removed is exposed as a yielding route.
2. Node labels are still selected from 32 angular candidates. The score includes label overlap, node clearance, route clearance, yielding-route penalties, candidate preference, and movement cost from the prior placement.
3. The feedback is bounded. The pipeline may perform one second pass when final node labels moved; it does not iterate to a fixed point and does not replace manual placement authority.
4. The App recomputes the complete automatic presentation whenever `positions` changes. Routing is order-sensitive because `deriveAutomaticRoutes()` accumulates `occupiedPaths`; relation-label placement also evaluates the other route paths.
5. The actual Product check used the real Apollo 11 node and route surface. A bounded Saturn V drag changed the visible selected-route geometry; the temporary coordinate was not saved.
6. A post-correction actual Product smoke check again used the real Apollo 11 surface and a temporary Saturn V drag. The route diagnostic updated and no obvious visual freeze was observed in that single interaction. This is not a browser FPS or pointer-latency measurement.

### Strongly supported

- The NASA label behavior is consistent with a local placement objective, not a global readability objective. The route-free yielding penalty makes a safe alternative more attractive, but prior-placement movement cost and other occupied labels can still keep a label in its existing neighborhood. In the baseline comparison, NASA moved from approximately `(326.5, 273.2)` in the pre-`a38e01f` pipeline to `(126.1, 293.2)` in `a38e01f`.
- Remote route propagation is architectural rather than accidental: moving one node changes the global route/label derivation, and later routes can see changed occupied paths or changed label obstacles. For a 50 graph-unit Saturn V move, 5 non-incident routes changed by more than 0.5 graph units; for a 50 graph-unit NASA move, 1 non-incident route changed. This is evidence of non-local propagation, not yet evidence that every such change is a Product defect.
- The extra feedback pass has a material computational cost. On the Apollo 11 fixture, a warm local pure-function benchmark gave:

  - pre-`a38e01f` bounded-equivalent pipeline: median `26.664 ms`, p95 `30.055 ms`
  - `a38e01f`: median `101.928 ms`, p95 `108.097 ms`
  - median increase: approximately `282.3%`

  This is a diagnostic benchmark on the Node implementation, not a browser FPS measurement.

### Unresolved

- The exact numeric ranking of every NASA candidate is not externally exposed, so the observed “more natural alternate direction” cannot yet be attributed to a single winning score without temporary instrumentation.
- It is not yet established whether the observed non-incident route changes are visually unacceptable, or merely the intended consequence of global obstacle-aware rerouting.
- Browser-frame timing, pointer-event latency, and actual FPS under repeated drag remain unmeasured. The pure-function benchmark establishes a performance risk, not a user-visible regression.
- Initial presentation quality, crossing reduction, and viewport framing remain separate questions. `a38e01f` does not change the initial node geometry or the fit policy.

## Minimal comparison baseline

The retained baseline is deliberately small:

| Measure | Role |
| --- | --- |
| node-label displacement for affected nodes | detects whether a candidate actually changes the presentation |
| route length and route geometry delta | detects route recovery and remote propagation |
| non-incident route-change count | separates local drag effects from global propagation |
| crossing count / visible crossing locations | checks whether route changes improve or worsen readability |
| browser/pure-function timing | detects computational risk before optimization |

The existing Apollo 11 spacing/layout metrics remain the comparison source for geometry and visual footprint. No new candidate was selected from this checkpoint.

## Bounded correction candidate

The first bounded correction reuses the label-free counterfactual route set
across the two possible feedback passes in
`deriveBoundedAutomaticPresentation()`. That route set depends on graph
geometry and manual route authority, not on the provisional/final label
snapshot, so the reuse does not change presentation semantics.

Changed path:

- `src/graph-presentation.ts`

The corrected output was byte-for-byte equivalent to a local uncached
`a38e01f` reproduction for the Apollo 11 fixture. The same benchmark shape
then measured:

- optimized `a38e01f`: median `76.879 ms`, p95 `81.421 ms`
- uncached `a38e01f`: median `101.928 ms`, p95 `108.097 ms`
- median reduction: approximately `24.6%`

This is a deterministic computation-cost correction, not an incremental
locality solution. Remote route propagation remains unchanged by design.

## Interpretation and next bounded direction

The current evidence supports treating `a38e01f` plus this correction as a
promising snapshot, not as a final solution. The next useful diagnostic is to
add temporary candidate-score visibility for one representative node (starting
with NASA) and to measure route propagation during a controlled drag. Any
further optimization should first target explicit dependency boundaries; it
should not silently change route, spacing, crossing, or manual-authority
semantics.

Cross-sample audit, crossing-aware placement, parallel/self-loop redesign, and spacing selection remain out of scope.

## Validation and preservation

- Apollo 11 actual Product surface inspected locally.
- One bounded real-browser Saturn V drag performed; no coordinate save and no evidence generation.
- Automated suite after the correction: `314/314 PASS`.
- Lint, build, and `git diff --check` passed after the correction.
- Fresh10/Fresh11/Fresh12 historical evidence and the canonical Fresh12 review result were not read-modified or regenerated.
- No governed Fresh lineage, push, tag, release, deploy, or publication was performed.

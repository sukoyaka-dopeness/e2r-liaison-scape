# Topology-Aware Free-Form Crossing-Minimizing Auto Layout Experiment 1

Date: 2026-09-15
Surface: current LiaisonScape `App` through the development-only
`topology-aware-free-form-crossing-experiment1` seam.
Status: diagnostic result; no user comparison handoff was opened.

## Candidate identity

The candidate is a bounded, deterministic, topology-aware free-form
experiment. It derives connected components, degree/hub roots, BFS layers, and
bridge signals, creates a jittered continuous seed, then applies bounded local
continuous moves. The final positions are not snapped to grid, circle, or
radial coordinates. Product presentation remains the authoritative evaluator.

The implementation is diagnostic-only. It does not change the production
provider, `settleInitialPlacement()`, Product routing, endpoint-plan,
Relation-label placement, Node-label placement, Self-loop routing, viewport,
Dataset, persistence, or Save Coordinates authority.

## Machine comparison

The compact values are `elapsed ms / generated candidates / Product
evaluations / fingerprint / crossings / overlapPairs / minimum separation /
extent / fitScale / labelRouteHits / labelNear20`.

| Fixture | Free-form candidate | Frontier crossings | Post crossings |
| --- | --- | ---: | ---: |
| Lighthouse EN | `257.5 / 6 / 6 / efdd9c32146c / 3 / 0 / 141.8 / 787x548 / .503 / 1 / 2` | 0 | 0 |
| Lighthouse JA | `175.3 / 6 / 6 / 9ac1c2c26159 / 3 / 0 / 156.6 / 787x541 / .509 / 1 / 2` | 0 | 0 |
| Apollo EN | `129.3 / 6 / 6 / 9da0a96cc4ab / 6 / 0 / 140.0 / 305x584 / .475 / 2 / 4` | 0 | 0 |
| Apollo JA | `117.6 / 6 / 6 / ffe7d7c231de / 6 / 0 / 140.1 / 562x374 / .703 / 2 / 3` | 0 | 0 |
| Titanic EN | `200.0 / 6 / 6 / 9595ff552998 / 0 / 0 / 140.2 / 2828x348 / .210 / 1 / 1` | 0 | 0 |
| Japanese long-label | `323.4 / 6 / 6 / eb1f38737e12 / 0 / 0 / 160.6 / 1545x410 / .378 / 0 / 0` | 0 | 0 |
| Dense `k7-7` | `1947.0 / 6 / 6 / 098fe9bb7986 / 100 / 0 / 146.5 / 1293x539 / .448 / 5 / 17` | 143 | 129 |

The exact geometry, topology signals, all six finalist summaries, and the
Frontier/Post reference values are persisted in
[`result-summary.json`](./result-summary.json).

The dense crossing reduction is real in the current Product evaluator, but it
does not constitute a quality win by itself: route-label hits and near-label
pressure remain, extent grows materially, and the Actual Product overview is
still not release-readable.

## Actual Product smoke observations

The following rows were opened in the real Product surface, checked at the
initial frame and after `Reset view`, and locally inspected where useful.
Screenshots were transient and were not committed as image files.

| Fixture | Reset observation | Smoke interpretation |
| --- | --- | --- |
| Lighthouse EN | Complete graph recovered at about 50%; free-form placement is inspectable but has visibly longer/wider routing and local label/route competition. | No clear visual improvement over Frontier/Post. |
| Apollo EN | Reset was about 48%; central NASA/astronaut incident relations remain crowded and the free-form topology does not improve ownership readability. | Product presentation residual remains. |
| Titanic EN | Reset fell to about 21% because the selected extent is about `2828 x 348`; the graph becomes a tiny horizontal strip and requires substantial local zoom. | Extent/overview trade-off is a clear regression. |
| Japanese long-label | Reset was about 38%; the graph is spread across a very wide canvas and long labels are too small/competing to associate reliably. | Long-label capacity is not solved. |
| Dense `k7-7` | Reset was about 45%; the graph is broad with fewer visible crossings than the earlier dense candidates, but repeated `connected` labels and route density remain non-release-readable. | Crossing improvement does not close presentation quality. |

This smoke check is diagnostic only and is not formal acceptance or Human
Review evidence.

## Decision

The experiment does establish that a topology-aware continuous seed plus
bounded local movement can produce genuinely free-form geometry and can lower
the current evaluator's dense crossing count. It does not establish a useful
general Auto Layout direction because:

- canonical Lighthouse/Apollo rows regress from zero crossing to 3–6 crossings;
- label-route and near-label pressure increases on the public rows;
- Titanic and long-label extent becomes impractical at Reset scale;
- dense crossing reduction is coupled to broad extent and unresolved label
  ownership/capacity;
- the six-candidate, six-Product-evaluation bounded search is reproducible, but
  it is not a production latency or quality guarantee.

The bounded outcome is closest to `C. STRUCTURAL IMPROVEMENT BUT PRESENTATION
TRADE-OFF`, with `D. NO MEANINGFUL GENERAL IMPROVEMENT OVER FRONTIER / POST`
for the current public Product surface. No new candidate is ready for user
visual comparison or Human Review.

No follow-up free-form retune, spacing retune, scoring retune, routing fix,
label fix, viewport policy, provider adoption, or Adaptive Cascade is opened
by this artifact.

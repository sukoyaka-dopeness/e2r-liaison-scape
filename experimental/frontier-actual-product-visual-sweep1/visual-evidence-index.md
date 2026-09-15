# Frontier Actual-Product Visual Sweep 1 — Evidence Index

Date: 2026-09-15
Surface: current LiaisonScape `App` through the development-only
`frontier-actual-product-visual-sweep1` seam.
Candidate: current-source Frontier-12 reconstruction from
`result-summary.json`; no historical artifact replay and no refinement stage.

## Capture protocol

Each row was opened in the real Product surface, checked for a stable
workspace, and inspected at the candidate's initial frame and after the
Product `Reset view` / fit action. A local zoom was used where overview scale
made labels too small to judge. Stored/authored Coordinates were not written;
the candidate entered through the disposable operation-local preview seam.

The evidence below is an index of the transient browser screenshots and
accessibility observations made during the smoke check. Screenshots were not
persisted as repository image files; the exact candidate geometry, selected
fingerprint, and source lineage are persisted in
[`result-summary.json`](./result-summary.json), and each URL is reproducible
while the development server is running.

## Public samples

| Fixture | Current source | Actual Product URL | Reset / local view | Observation |
| --- | --- | --- | --- | --- |
| Lighthouse EN | `e2r-spec/examples/lighthouse-restoration-demo.en.e2r.json` | `?fixture=lighthouse-en` | Reset; local zoom | Full graph recovered after initial viewport clipping; ordinary routes, self-loop, labels, and node separation were inspectable. Some long Node text is truncated by normal Product label treatment. |
| Lighthouse JA | `e2r-spec/examples/lighthouse-restoration-demo.ja.e2r.json` | `?fixture=lighthouse-ja` | Reset | Japanese labels remained inspectable; the same compact overview trade-off was visible, without a gross topology failure. |
| Apollo 11 EN | `e2r-spec/examples/apollo-11-mission.en.e2r.json` | `?fixture=apollo-en` | Reset | Geometry was inspectable; several incident Relation labels near NASA/astronaut nodes remain locally crowded. |
| Apollo 11 JA | `e2r-spec/examples/apollo-11-mission.ja.e2r.json` | `?fixture=apollo-ja` | Reset | Japanese relation ownership remained understandable but the same central incident-label crowding remained. |
| Berlin Wall EN | `e2r-narrative-line/src/sample/berlin-wall-history.en.e2r.json` | `?fixture=berlin-wall-en` | Reset | Clear small-to-moderate graph; no gross crossing, body-overlap, or label-ownership failure observed. |
| Berlin Wall JA | `e2r-narrative-line/src/sample/berlin-wall-history.ja.e2r.json` | `?fixture=berlin-wall-ja` | Reset | Japanese node and relation text was inspectable; long text reduced local density but did not break the graph. |
| Ashen Crown EN | `e2r-spec/examples/ashen-crown.en.e2r.json` | `?fixture=ashen-crown-en` | Reset | Graph was usable, but the central/right cluster retained clear route and Relation-label crowding. |
| Ashen Crown JA | `e2r-spec/examples/ashen-crown.ja.e2r.json` | `?fixture=ashen-crown-ja` | Reset | Japanese central cluster had the same ownership/crowding residual; geometry remained navigable. |
| Titanic EN | `e2r-spec/examples/titanic-final-voyage.en.e2r.json` | `?fixture=titanic-en` | Reset; local zoom | Reset fit produced a small overview; local zoom was required for reliable label reading. The graph itself remained structurally coherent. |
| Titanic JA | `e2r-spec/examples/titanic-final-voyage.ja.e2r.json` | `?fixture=titanic-ja` | Reset | Same overview-scale limitation; local Japanese labels were not judged from overview alone. |

## Research stress controls

| Fixture | Product URL | Observation |
| --- | --- | --- |
| `synthetic:k7-7` | `?fixture=dense-k7-7` | Reset produced a complete but visibly dense 14-node/49-edge surface; crossing/label ownership is not release-readable at overview scale. |
| `synthetic:k6-8` | `?fixture=dense-k6-8` | Same dense global coupling and repeated `connected` labels; no evidence that Frontier alone resolves presentation capacity. |
| `synthetic:k8-8` | `?fixture=dense-k8-8` | 16-node/64-edge surface remained visibly unreadable at fit scale; this is a stress-limit observation, not a public-sample rejection. |
| Japanese long-label control | `?fixture=label-heavy-ja-10` | Long Japanese Node/Relation labels overwhelm the available presentation area; local zoom does not remove the ownership/corridor coupling. |
| Parallel / Self-loop control | `?fixture=parallel-self-loop-control` | Reset reached a clear 100% view. Parallel lanes separated, reverse directions were distinguishable, and the self-loop was visible without a gross geometry failure. |

## Smoke conclusion

Public samples are sufficiently usable to permit a bounded user visual
comparison of the Frontier candidate. This is not formal acceptance and does
not create a Human Review candidate. The dense and long-label controls retain
the known Product routing / Relation-label capacity boundary; their failure is
not attributed to Structural Placement alone.

# Frontier vs G3 vs Post — Actual Product Evidence Index

Date: 2026-09-15
Surface: current LiaisonScape `App` through the development-only
`frontier-g3-post-current-source-comparison1` seam.
Purpose: user comparison of three current-source candidate materializations
on the same fixture row. This is not an acceptance result.

## Capture protocol

Each candidate is opened with the same fixture query, inspected at the initial
frame and after Product `Reset view` / fit, and locally zoomed where needed.
The preview is read-only and disposable; Coordinates are not saved. Browser
screenshots were transient and are not committed as image files. The exact
geometry, fingerprint, candidate count, Product presentation evaluation count,
and machine metrics are in [`result-summary.json`](../../frontier-g3-post-current-source-comparison1/result-summary.json).

Base URL:

`http://127.0.0.1:5174/e2r-liaison-scape/experimental/product-evaluation-seam/frontier-g3-post-current-source-comparison1/`

Each row is reproducible with `?fixture=<fixture>&candidate=frontier|g3|post`.

## Machine comparison

The compact values below are `fingerprint / elapsed ms / candidates / Product
evaluations / crossings / minimum separation / extent / fitScale`.

| Fixture | Frontier | G3 | Post |
| --- | --- | --- | --- |
| Lighthouse EN | `4cc6d8ae2c92 / 651 / 12 / 13 / 0 / 169 / 529x545 / .506` | `4cc6d8ae2c92 / 1324 / 1 / 46 / 0 / 169 / 529x545 / .506` | `83c990d7ef46 / 9430 / 53 / 468 / 0 / 144.1 / 633x401 / .662` |
| Lighthouse JA | `4cc6d8ae2c92 / 635 / 12 / 13 / 0 / 169 / 529x545 / .506` | `4cc6d8ae2c92 / 1313 / 1 / 46 / 0 / 169 / 529x545 / .506` | `25da7dc81368 / 9104 / 53 / 440 / 0 / 136.1 / 640x418 / .639` |
| Apollo EN | `9e821a079aee / 620 / 12 / 13 / 0 / 172 / 517x367 / .715` | `9e821a079aee / 1154 / 1 / 62 / 0 / 172 / 517x367 / .715` | `260e766b79de / 5632 / 69 / 454 / 0 / 164 / 622x419 / .638` |
| Apollo JA | `9e821a079aee / 766 / 12 / 13 / 0 / 172 / 517x367 / .715` | `9e821a079aee / 1154 / 1 / 62 / 0 / 172 / 517x367 / .715` | `552cdc0d22a3 / 5381 / 69 / 437 / 0 / 129.7 / 601x400 / .664` |
| Titanic EN | `9a27b996f084 / 673 / 12 / 13 / 0 / 168.2 / 714x694 / .406` | `9a27b996f084 / 1267 / 1 / 46 / 0 / 168.2 / 714x694 / .406` | `4c23c0512579 / 8829 / 53 / 495 / 0 / 124.0 / 744x584 / .475` |
| Japanese long-label | `66a8a20d5889 / 1521 / 12 / 13 / 0 / 142.9 / 437x496 / .550` | `4497db154404 / 2714 / 1 / 46 / 0 / 169 / 529x545 / .506` | `f2f79e547b2a / 21150 / 53 / 458 / 0 / 140.1 / 673x345 / .753` |
| Dense `k7-7` | `bdd252c1b045 / 4046 / 12 / 13 / 143 / 172 / 690x368 / .713` | `ab9eadb27b53 / 7957 / 44 / 44 / 129 / 164 / 784x328 / .717` | `ab9eadb27b53 / 7743 / 44 / 44 / 129 / 164 / 784x328 / .717` |

G3 is not visually distinct from Frontier on the canonical public rows where
the selected fingerprint is identical. Dense G3 and Post also select the same
`grid-structural` fingerprint. These equalities are evidence of selected
geometry equivalence, not a claim that the internal search cost is equal.

## Actual Product observations

| Fixture / candidate | Reset and local inspection observation | User judgment |
| --- | --- | --- |
| Lighthouse EN / Frontier | Full graph recoverable; topology inspectable. Local route/label crowding remains in places. | `NOT REVIEWED` |
| Lighthouse EN / G3 | Same selected geometry as Frontier; no new visual signal. | `NOT REVIEWED` |
| Lighthouse EN / Post | More horizontally compact and larger at Reset; generally easier to inspect, but route/label association residuals remain. | `NOT REVIEWED` |
| Lighthouse JA / Frontier | Japanese graph inspectable after Reset; prior Frontier sweep evidence reused. | `NOT REVIEWED` |
| Lighthouse JA / G3 | Same selected geometry as Frontier; no new visual signal. | `NOT REVIEWED` |
| Lighthouse JA / Post | Japanese labels remain inspectable at about 79%; no gross topology failure observed. | `NOT REVIEWED` |
| Apollo EN / Frontier | Geometry inspectable; central NASA/astronaut incident labels remain locally crowded. Prior Frontier sweep evidence reused. | `NOT REVIEWED` |
| Apollo EN / G3 | Same selected geometry as Frontier; no new visual signal. | `NOT REVIEWED` |
| Apollo EN / Post | More compact and broadly readable, but central incident-label association remains crowded. | `NOT REVIEWED` |
| Apollo JA / Frontier | Same central incident-label crowding with Japanese labels. Prior Frontier sweep evidence reused. | `NOT REVIEWED` |
| Apollo JA / G3 | Same selected geometry as Frontier; no new visual signal. | `NOT REVIEWED` |
| Apollo JA / Post | Japanese relations remain inspectable; central cluster is still close but no gross clipping observed. | `NOT REVIEWED` |
| Titanic EN / Frontier | Structurally coherent; Reset overview is small and local zoom is needed. Prior Frontier sweep evidence reused. | `NOT REVIEWED` |
| Titanic EN / G3 | Same selected geometry as Frontier; no new visual signal. | `NOT REVIEWED` |
| Titanic EN / Post | More compact extent, but Reset remains an overview requiring local zoom for reliable text reading. | `NOT REVIEWED` |
| Japanese long-label / Frontier | Long Japanese Node/Relation labels remain coupled; local zoom does not remove ownership/corridor pressure. Prior Frontier sweep evidence reused. | `NOT REVIEWED` |
| Japanese long-label / G3 | Denser overview; long labels are difficult to associate. | `NOT REVIEWED` |
| Japanese long-label / Post | Larger 75% view, but long Japanese Node/Relation labels visibly overlap/compete; capacity problem is not solved. | `NOT REVIEWED` |
| Dense `k7-7` / Frontier | 14 nodes / 49 relations; dense crossing and repeated `connected` labels are not release-readable at Reset. | `NOT REVIEWED` |
| Dense `k7-7` / G3 | Same selected geometry as Post; dense crossing and repeated labels remain. | `NOT REVIEWED` |
| Dense `k7-7` / Post | Same selected geometry as G3; no Product readability win over G3 was visible. | `NOT REVIEWED` |

The Frontier notes for public rows reuse the preceding Actual Product sweep;
the current comparison specifically re-opened the G3/Post rows needed to test
whether their current-source geometry changes produce a distinct Product
surface. No screenshot or transient inspection is treated as the user's
acceptance.

## Review boundary

The current evidence supports a user visual comparison, not a machine-declared
winner. The user should compare initial frame, Reset / fit, local zoom, Node
separation, route crossing, Relation-label ownership, long-label readability,
and overall trust, then record one of `FRONTIER`, `G3`, `POST`, `ROUGHLY EQUAL`,
or `NONE GOOD` per fixture or for the set.

Product ordinary routing, Parallel/Incident allocation, endpoint-plan,
Relation-label placement, Node-label placement, Self-loop routing,
viewport/camera, styling/interaction, Dataset lifecycle, persistence, Save
Coordinates, and manual placement remain authoritative. No candidate is
adopted or persisted.

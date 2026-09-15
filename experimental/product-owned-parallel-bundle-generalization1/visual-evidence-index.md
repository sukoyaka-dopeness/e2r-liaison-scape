# Product-Owned Parallel Bundle + Relation-Label Ownership Generalization 1

This is a bounded Actual Product smoke check, not formal acceptance or Human
Review evidence. All views use the current `App` through a read-only
operation-local preview seam. No Dataset Coordinates or Product defaults are
written.

## Reproducible surfaces

- Reverse + same-direction + Self-loop control:
  `http://127.0.0.1:5174/e2r-liaison-scape/experimental/product-evaluation-seam/product-owned-parallel-bundle-generalization1/?fixture=parallel-self-loop-control&candidate=current`
- The same control with the widened fixed reference:
  `http://127.0.0.1:5174/e2r-liaison-scape/experimental/product-evaluation-seam/product-owned-parallel-bundle-generalization1/?fixture=parallel-self-loop-control&candidate=bundle-16`
- Mixed incident control, current:
  `http://127.0.0.1:5174/e2r-liaison-scape/experimental/product-evaluation-seam/product-owned-parallel-bundle-generalization1/?fixture=mixed-incident-parallel&candidate=current`
- Mixed incident control, widened fixed reference:
  `http://127.0.0.1:5174/e2r-liaison-scape/experimental/product-evaluation-seam/product-owned-parallel-bundle-generalization1/?fixture=mixed-incident-parallel&candidate=bundle-16`
- Public Lighthouse sample, current:
  `http://127.0.0.1:5174/e2r-liaison-scape/experimental/product-evaluation-seam/product-owned-parallel-bundle-generalization1/?fixture=lighthouse-en&candidate=current`
- Public Lighthouse sample, widened fixed reference:
  `http://127.0.0.1:5174/e2r-liaison-scape/experimental/product-evaluation-seam/product-owned-parallel-bundle-generalization1/?fixture=lighthouse-en&candidate=bundle-16`

## Smoke observations

| Control | Observation |
| --- | --- |
| Reverse + same-direction | The widened view makes the alpha/beta four-lane bundle easier to scan and reverse arrows easier to follow. The gamma/delta same-direction pair remains visibly separated. The Self-loop remains present and unchanged. |
| Mixed incident | After Reset, both current and widened views remain fully inspectable. Ordinary incident routes remain visible; the widened bundle improves lane separation without an obvious ordinary-route displacement or graph-structure break. |
| Public Lighthouse | The public sample remains usable at its normal 51% Reset fit. The Clara/Thomas Parallel labels remain associated with their lanes and no gross clipping or crossing regression was observed. The visual difference is modest because the public graph is fit-scale constrained. |

The machine artifact records the higher-multiplicity control as well. It is
used for bounded scaling evidence rather than a separate formal visual review.
Screenshots were inspected transiently and are not persisted as acceptance
artifacts.

## Interpretation

The fixed widened reference is a useful diagnostic presentation direction, but
the new adaptive implementation is intentionally not adopted. Its graph-wide
spacing signal selected 20 for the primary control and caused the gamma/delta
pair to lose its balanced geometry. This is evidence that a future adaptive
policy must be bundle-local, or must retain a bounded cross-bundle feasibility
check; a single graph-wide spacing scalar is not sufficient.

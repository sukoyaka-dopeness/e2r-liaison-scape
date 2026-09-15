# Product Presentation Local Spacing + Parallel/Label/Self-loop Refinement 1

This is a bounded Actual Product smoke check, not formal acceptance or Human
Review evidence. The seam uses the current `App` and a read-only
operation-local preview; it does not write Dataset Coordinates or change
Product defaults.

## Reproducible URLs

- Current control:
  `http://127.0.0.1:5174/e2r-liaison-scape/experimental/product-evaluation-seam/product-presentation-local-spacing-parallel-label-self-loop-refinement1/?candidate=current&variant=current`
- Current geometry with the development-only widened bundle variant:
  `http://127.0.0.1:5174/e2r-liaison-scape/experimental/product-evaluation-seam/product-presentation-local-spacing-parallel-label-self-loop-refinement1/?candidate=current&variant=bundle-16`
- Bounded alpha/beta local-spacing probe:
  `http://127.0.0.1:5174/e2r-liaison-scape/experimental/product-evaluation-seam/product-presentation-local-spacing-parallel-label-self-loop-refinement1/?candidate=local-spacing-1.15&variant=current`

## Smoke observations

| Surface | Observation |
| --- | --- |
| Current default | The alpha/beta bundle is readable and has no gross route failure, but the four lanes visually bias toward the upper side. Labels remain inspectable, though the reverse-direction ownership is less immediate. The epsilon Self-loop remains visibly above the Node. |
| `bundle-16` | The same Node geometry produces a visibly wider/fan-out bundle with a 2:2 physical-side result in the probe. The four labels and reverse arrows are easier to associate locally. No obvious crossing, Node collision, or ordinary-route break was observed in the smoke frame. |
| `local-spacing-1.15` | Alpha/beta separation increases from 173 to 198.95 source units, but the visible gain is smaller than the route-variant gain. It does not change the Self-loop direction and is not independently selected as a Product candidate. |
| Reset view | Reset reaches 100% and centers the graph in the Product graph surface. The initial preview frame is smaller and visually left-biased because the preview opens with the fixed 800x500 fit contract; this is a framing/initialization issue, not evidence that the Node ordering must move. No viewport fix was adopted here. |

Screenshots were inspected transiently through the browser surface and are not
stored as acceptance artifacts. The JSON result contains the reproducible
candidate geometry and machine measurements.

## Interpretation

The bounded route refinement is a plausible local Product direction, but it is
still a development-only variant and remains NOT READY for Human Review. The
Self-loop direction requires a separate Product-owned angular-capacity
experiment; the manual orientation probes in the JSON are diagnostic only and
must not be read as adoption evidence.

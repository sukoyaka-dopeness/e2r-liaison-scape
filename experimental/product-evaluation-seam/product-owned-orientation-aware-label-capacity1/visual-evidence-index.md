# Product-Owned Orientation-Aware Label Capacity + Stagger 1 — Actual Product Smoke

Date: 2026-09-16

These are development-only Actual Product preview URLs. Use **Reset view** after
navigation. This smoke is not formal visual acceptance.

## Horizontal capacity control

- current: `/e2r-liaison-scape/experimental/product-evaluation-seam/product-owned-orientation-aware-label-capacity1/?fixture=horizontal-label-capacity&candidate=current`
- bundle-local reference: `/e2r-liaison-scape/experimental/product-evaluation-seam/product-owned-orientation-aware-label-capacity1/?fixture=horizontal-label-capacity&candidate=reference`
- orientation-aware: `/e2r-liaison-scape/experimental/product-evaluation-seam/product-owned-orientation-aware-label-capacity1/?fixture=horizontal-label-capacity&candidate=orientation-aware`

Current and reference keep the three routes readable but the long labels remain
concentrated around the short owner span. Orientation-aware tangential offsets
spread the labels along the owner direction and improve visible association;
the two long labels still exceed the measured one-line usable span. This is a
display-capacity residual, not a reason to widen Structural Placement. Wrap is
recorded for a future display-only checkpoint and is not implemented here.

## Vertical and diagonal controls

- vertical reference: `/e2r-liaison-scape/experimental/product-evaluation-seam/product-owned-orientation-aware-label-capacity1/?fixture=vertical-label-capacity&candidate=reference`
- vertical orientation-aware: `/e2r-liaison-scape/experimental/product-evaluation-seam/product-owned-orientation-aware-label-capacity1/?fixture=vertical-label-capacity&candidate=orientation-aware`
- diagonal reference: `/e2r-liaison-scape/experimental/product-evaluation-seam/product-owned-orientation-aware-label-capacity1/?fixture=diagonal-label-capacity&candidate=reference`
- diagonal orientation-aware: `/e2r-liaison-scape/experimental/product-evaluation-seam/product-owned-orientation-aware-label-capacity1/?fixture=diagonal-label-capacity&candidate=orientation-aware`

Vertical labels visibly move to distinct along-edge positions, but the existing
reference was already readable and the machine ownership ambiguity remains two;
there is no established quality win. The diagonal candidate uses continuous
tangent/normal projection and remains visually smooth; no binary orientation
break or gross route/label failure was observed.

## Primary control with Self-loop

- current: `/e2r-liaison-scape/experimental/product-evaluation-seam/product-owned-orientation-aware-label-capacity1/?fixture=parallel-self-loop-control&candidate=current`
- bundle-local reference: `/e2r-liaison-scape/experimental/product-evaluation-seam/product-owned-orientation-aware-label-capacity1/?fixture=parallel-self-loop-control&candidate=reference`
- orientation-aware: `/e2r-liaison-scape/experimental/product-evaluation-seam/product-owned-orientation-aware-label-capacity1/?fixture=parallel-self-loop-control&candidate=orientation-aware`

At the Product Reset fit, the orientation-aware preview preserves the selected
alpha/beta and gamma/delta bundle geometry, ordinary cycle, and Self-loop. No
gross visual regression was seen. This does not reopen or evaluate the
Self-loop selector.

## Smoke conclusion

Actual Product inspection supports a bounded presentation diagnostic, not a
Human Review candidate. Tangential/stagger offsets can improve association in
the targeted controls, but vertical improvement is not generally established
and horizontal long-label capacity remains unresolved. The Product route and
final Relation-label authorities remain the source of truth; no acceptance,
default, provider, or release decision follows from this smoke.

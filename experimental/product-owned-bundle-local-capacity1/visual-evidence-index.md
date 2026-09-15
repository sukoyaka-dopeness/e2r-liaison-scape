# Product-Owned Bundle-Local Capacity 1 — Actual Product Smoke

Date: 2026-09-16

These are development-only Actual Product preview URLs. Use **Reset view**
after navigation. The smoke is not formal visual acceptance.

## Primary reverse + same-direction + Self-loop

- current: `/e2r-liaison-scape/experimental/product-evaluation-seam/product-owned-bundle-local-capacity1/?fixture=parallel-self-loop-control&candidate=current`
- fixed 16: `/e2r-liaison-scape/experimental/product-evaluation-seam/product-owned-bundle-local-capacity1/?fixture=parallel-self-loop-control&candidate=fixed16`
- bundle-local: `/e2r-liaison-scape/experimental/product-evaluation-seam/product-owned-bundle-local-capacity1/?fixture=parallel-self-loop-control&candidate=bundle-local`

At 100% Reset fit, the local `alpha/beta=20` result keeps the four lanes and
reverse arrows traceable. `gamma/delta=12` stays on both physical sides and is
visibly separated; it does not reproduce the graph-wide spacing-20 collapse.
The Self-loop and surrounding ordinary cycle remain unchanged. The local view
is close to fixed 16, with slightly more alpha/beta fan-out and less unnecessary
gamma/delta fan-out.

## Shared-endpoint multiple-bundle control

- current: `/e2r-liaison-scape/experimental/product-evaluation-seam/product-owned-bundle-local-capacity1/?fixture=shared-endpoint-multiple-bundle&candidate=current`
- fixed 16: `/e2r-liaison-scape/experimental/product-evaluation-seam/product-owned-bundle-local-capacity1/?fixture=shared-endpoint-multiple-bundle&candidate=fixed16`
- bundle-local: `/e2r-liaison-scape/experimental/product-evaluation-seam/product-owned-bundle-local-capacity1/?fixture=shared-endpoint-multiple-bundle&candidate=bundle-local`

At 89% Reset fit, local selection falls back to `16/16` and is visually exact
to the fixed reference. Both bundles remain traceable and ordinary Relations do
not detour. One foreign-closer/ambiguous ownership residual remains. A wider
joint arm can remove it, but slightly regresses the reverse bundle's minimum
lane separation; the bounded selector correctly does not claim a generalized
win from that trade-off.

## Higher multiplicity and mixed incident

- higher local: `/e2r-liaison-scape/experimental/product-evaluation-seam/product-owned-bundle-local-capacity1/?fixture=higher-multiplicity-5&candidate=bundle-local`
- mixed local: `/e2r-liaison-scape/experimental/product-evaluation-seam/product-owned-bundle-local-capacity1/?fixture=mixed-incident-parallel&candidate=bundle-local`

The five-lane control remains readable at 80% Reset fit, but the changed
`ordinary-bd` route is visible inside the bundle fan-out. This is a real
coupling cost rather than a free improvement. The mixed-incident spacing-24
view is fully visible at 66%; four lanes and reverse directions remain
traceable, ownership ambiguity is removed, and no unnatural ordinary detour is
apparent.

## Public Lighthouse EN

- current: `/e2r-liaison-scape/experimental/product-evaluation-seam/product-owned-bundle-local-capacity1/?fixture=lighthouse-en&candidate=current`
- fixed 16: `/e2r-liaison-scape/experimental/product-evaluation-seam/product-owned-bundle-local-capacity1/?fixture=lighthouse-en&candidate=fixed16`
- bundle-local: `/e2r-liaison-scape/experimental/product-evaluation-seam/product-owned-bundle-local-capacity1/?fixture=lighthouse-en&candidate=bundle-local`

All three remain usable at the Product's 51% Reset fit. Local spacing 12 gives
the Clara/Thomas pair a modest lane improvement over current without the full
fixed-16 expansion. Relation-label association, two Self-loops, ordinary graph
structure, and framing show no gross regression. At this overview scale the
visual difference is subtle and does not establish Human Review readiness.

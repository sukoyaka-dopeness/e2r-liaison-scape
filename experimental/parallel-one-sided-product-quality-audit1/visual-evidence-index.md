# Parallel One-Sided Product Quality Audit 1

This is a bounded Actual Product smoke and source-level responsibility audit.
It is not formal acceptance or Human Review evidence.

## Reproducible surfaces

- Corrected Japanese portfolio preview: `http://127.0.0.1:5174/e2r-liaison-scape/experimental/product-evaluation-seam/cross-family-product-authoritative-auto-layout-portfolio-selector1/?fixture=label-heavy-ja-10&candidate=selected`
- Parallel/Self-loop Product control: `http://127.0.0.1:5174/e2r-liaison-scape/experimental/product-evaluation-seam/frontier-actual-product-visual-sweep1/?fixture=parallel-self-loop-control`

Both use the current Product `App` and read-only operation-local preview. The
Japanese fixture now renders actual Japanese characters. Its topology, IDs,
labels, locale, and candidate positions are generated/materialized through
the same diagnostic fixture contract.

## Smoke observations

- The corrected Japanese surface contains readable Japanese glyphs; the
  previous mojibake was a preview/tool fixture-integrity defect, not Product
  rendering evidence.
- The Parallel control shows distinct curved lanes and reverse arrows. At
  local zoom, the `alpha`/`beta` bundle has four visible routes, but the
  source-level audit records a physical-side distribution of `1` versus `3`,
  so visual separation does not imply symmetric side allocation.
- The self-loop remains visible and the unrelated `gamma`/`delta` parallel
  pair remains balanced. No broad Product break was observed.

## Source/evidence interpretation

The current Product path does not call the experimental incident allocator or
expose an endpoint-plan object. It derives canonical `parallelIndex` and
`parallelCount` in `buildEntityGraph`, then selects routes in
`routeGraphEdge` using `canonicalPhysicalSideSign`, occupied-path conflicts,
and Relation-label pressure. For `alpha`/`beta`, the reverse routes' base-side
candidates are rejected by occupied-path conflict or label pressure, so both
reverse routes are moved to the same physical side. This is a downstream
routing/label-arbitration residual under hard feasibility pressure, not
evidence that Structural Placement collapsed the bundle or that the closed
incident architecture must be reopened.

No safe bounded fix was adopted in this checkpoint: forcing the rejected
opposite-side candidates would trade the observed one-sided distribution for
occupied-path or label-clearance failure. The next fix, if authorized, should
remain within current Product routing/presentation authority and be tested
against the same control plus reverse and incident controls.

# Pages fixture revision correction

Status: `CORRECTED LOCALLY / PUSH AND DEPLOY PENDING HUMAN APPROVAL`

Date: 2026-09-21

The Pages workflow previously checked out e2r-spec at
`11126d635de7d8d26f4989e744aa96f952d881bb`. The current LiaisonScape
acceptance surface requires
`examples/lighthouse-restoration-demo.en.e2r.json`, which is not present at
that revision. This caused the fresh GitHub Actions test step to fail before
the Pages deployment step.

The workflow now pins e2r-spec to the immutable fixture checkpoint
`e918d55f4d10b2300d657ee986a4077d10fc03a8`. That checkpoint contains the
coordinate-less public sample fixtures required by the current tests; later
e2r-spec changes through the inspected current revision are documentation-only
for this dependency boundary. The workflow remains revision-pinned rather
than following `main`.

Validation at the LiaisonScape source checkpoint:

- focused fixture-boundary test: passed with the pinned fixture;
- full test suite: 636 passed, 0 failed;
- lint: passed;
- production build: passed;
- `git diff --check`: passed.

This correction changes only the CI fixture revision boundary and this result
record. It does not change runtime behavior, Dataset/sample contents, or
e2r-spec. The resulting LiaisonScape commit is a local deployment candidate;
push, Pages deployment, tag, release, and publication remain pending explicit
Human approval.

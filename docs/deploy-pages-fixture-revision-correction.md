# Pages fixture revision correction

Status: `CORRECTED LOCALLY / PUSH AND DEPLOY PENDING HUMAN APPROVAL`

Date: 2026-09-21

The Pages workflow previously checked out e2r-spec at
`11126d635de7d8d26f4989e744aa96f952d881bb`. The current LiaisonScape
acceptance surface requires
`examples/lighthouse-restoration-demo.en.e2r.json`, which is not present at
that revision. This caused the fresh GitHub Actions test step to fail before
the Pages deployment step.

The first local correction selected the immutable checkpoint
`e918d55f4d10b2300d657ee986a4077d10fc03a8`, but that object is not reachable
from the public e2r-spec remote. The workflow now pins the public immutable
SHA `33be032fe109515b409a7e6c176f2bd632149e5c`, the current public
e2r-spec `main` tip at this audit. It contains every fixture path used by the
LiaisonScape CI contract. Lighthouse and Apollo carry Coordinate Extension
records at this public revision; those fields are outside the current
LiaisonScape test consumers, and the full suite passes against the public
fixture matrix. The workflow remains revision-pinned rather than following
`main` by name.

Validation at the LiaisonScape source checkpoint:

- public remote reachability: `33be032fe109515b409a7e6c176f2bd632149e5c` was
  fetched from the public e2r-spec history;
- fresh public-fixture matrix: full test suite, 636 passed, 0 failed;
- focused fixture-boundary test: passed with the public fixture;
- current source full test suite: 636 passed, 0 failed;
- lint: passed;
- production build: passed;
- `git diff --check`: passed.

This correction changes only the CI fixture revision boundary and this result
record. It does not change runtime behavior, Dataset/sample contents, or
e2r-spec. The resulting LiaisonScape commit is a local deployment candidate;
push, Pages deployment, tag, release, and publication remain pending explicit
Human approval.

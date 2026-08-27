# LiaisonScape Development Guidance

## Reusable knowledge

The central workspace knowledge base is `C:\Users\extra\E2R\ai-knowledge`.
Before routing, layout, geometry, labels, placement, Dataset safety, or
Handoff work, search its `INDEX.md` by topic. Apply entries only within their
stated scope; hypotheses are not accepted decisions.

LiaisonScape is an E2R application for relationship-oriented exploration and
editing. Preserve compatibility with the sibling `../e2r-spec` repository and
keep application behavior separate from E2R Core semantics.

## Application modularization policy

Apply the workspace Decision in
`ai-knowledge/decisions/application-modularization-and-incremental-extraction.md`.
Prefer bounded, responsibility-based extraction when new workflow would
otherwise enlarge `src/App.tsx`, especially around Detail and deletion
orchestration. Do not perform a wholesale rewrite, split files mechanically,
or change accepted graph interaction and Dataset semantics for modularization.

## Git Checkpoint Policy

Codex may create local commits for one bounded logical checkpoint when it is
complete and verified. Before committing, inspect `git status --short`, stage
only exact owned paths or hunks, inspect `git diff --cached --name-status`, run
`git diff --cached --check`, and run the relevant application gates. The normal
LiaisonScape gates are `npm test`, `npm run lint`, and `npm run build`.

After committing, report the hash, subject, scope, verification results,
worktree status, and unpushed status. Preserve unrelated dirty work.

Do not use the following unless the user explicitly authorizes that exact
operation:

- `git add .`
- `git add -A`
- `git commit -a`
- `git reset --hard`
- `git clean`
- broad `git restore`
- broad or automatic `git stash`
- rebase
- squash
- amend of an existing checkpoint
- history rewriting
- force push

Prefer exact-path staging such as:

`git add -- path/to/file1 path/to/file2`

or precise hunk staging when required. Push, release, deployment, and
publication always require explicit authorization.

# LiaisonScape Development Guidance

LiaisonScape is an E2R application for relationship-oriented exploration and
editing. Preserve compatibility with the sibling `../e2r-spec` repository and
keep application behavior separate from E2R Core semantics.

## Git Checkpoint Policy

Codex may create local commits for one bounded logical checkpoint when it is
complete and verified. Before committing, inspect `git status --short`, stage
only exact owned paths or hunks, inspect `git diff --cached --name-status`, run
`git diff --cached --check`, and run the relevant application gates. The normal
LiaisonScape gates are `npm test`, `npm run lint`, and `npm run build`.

After committing, report the hash, subject, scope, verification results,
worktree status, and unpushed status. Preserve unrelated dirty work. Do not
use broad staging, reset, clean, restore, stash, rebase, squash, amend,
history rewriting, or force push without explicit authorization. Push,
release, deployment, and publication always require explicit authorization.

# Decision 0023: Authoring Distribution Boundary

- Status: accepted
- Date: 2026-11-23

## Context

The GitHub repository is used to develop newHOP, while authors need a
smaller package containing built libraries, curated examples, authoring
documentation, and distributable assets. Maintaining a second synchronized
repository would add release and copy-commit overhead.

The repository also contains local project pages and experiments that are not
intended for redistribution.

## Decision

Keep one development repository and generate the author-facing package from
an explicit set of repository files.

- `src/`, `scripts/`, `docs/development/`, and root project files serve
  developers.
- `examples/` contains only curated examples and assets that may be included
  in the authoring distribution.
- `workbench/` is ignored local project material and is never part of the
  distribution.
- `docs/authoring/` contains author-facing documentation and distribution
  source files.
- `dist/` contains the generated local build used by examples and later
  copied into the distribution.
- A future distribution builder creates a clean generated package and may
  produce an archive for a release.

The root `README.md` and `AGENTS.md` remain developer files. The distribution
has its own README and entry page sourced from `docs/authoring/`.

## Consequences

- There is no second repository to synchronize with build output.
- Example and asset curation becomes an explicit release responsibility.
- The distribution builder must use an explicit manifest and must not copy the
  repository wholesale.
- The authoring package can be validated independently from the development
  repository.
- Local workbench material can remain useful without becoming public package
  content.

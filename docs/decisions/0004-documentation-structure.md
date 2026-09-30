# ADR 0004: HTML Reference and Markdown Contributor Docs

- Status: accepted
- Date: 2026-09-17

## Context

newHOP has two audiences: authors using the library and developers changing the library. One document format should not have to serve both jobs.

## Decision

Keep plain HTML pages for user-facing authoring and API reference. Keep Markdown files in `docs/` for architecture, contribution workflow, roadmap, and decision records.

The documentation index links to the HTML reference pages. Contributor documents are versioned with the source and reviewed like code.

## Consequences

- Authors can open documentation directly from the static Vite site.
- Contributors can find setup, ownership, design constraints, and open work in the repository.
- Design history is no longer dependent on private assistant memory.

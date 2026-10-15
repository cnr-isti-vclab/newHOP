# newHOP Agent Instructions

## Project Documentation

- Treat `docs/architecture.md` as the current high-level design document. Keep it updated whenever runtime ownership, public APIs, scene blocks, navigation behavior, loading behavior, or bundle structure changes.
- Keep the relevant documentation pages in `docs/` and the examples in `examples/` aligned with user-visible behavior and public APIs.
- Update `docs/roadmap.md` when priorities, completed work, or open questions change.
- Record durable architectural decisions in a new numbered file under `docs/decisions/` rather than leaving them only in chat or code comments.
- Keep documentation changes in the same change as the implementation they describe.

## Pre-1.0 Policy

- Before the official 1.0 release, current requirements and architecture take priority over old 3DHOP compatibility expectations and provisional prior decisions.
- Earlier decisions may be revised or superseded when implementation experience or current requirements justify it.
- Intentional breaking changes must update the public API, documentation, examples, architectural decision records, and validation in the same change.

## Validation

- Run `npm run typecheck` after TypeScript changes.
- Run `npm run build` when changes affect build output, public APIs, loaders, examples, or documentation references to generated bundles.
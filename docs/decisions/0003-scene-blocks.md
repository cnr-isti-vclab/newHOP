# ADR 0003: Named Scene Blocks

- Status: accepted
- Date: 2026-09-17

## Context

A single entity list would mix models, hotspots, helpers, world settings, and navigation concerns. The authoring API needs names that communicate intent and preserve useful distinctions from 3DHOP.

## Decision

Use named scene blocks:

- `config`
- `world`
- `navigation`
- `lighting`
- `helpers`
- `objects`
- `spots`

Objects and spots are keyed collections and maintain separate semantics. Objects represent scene content; spots represent hotspot or annotation content.

## Consequences

- Authoring pages can document each block independently.
- Runtime managers can own focused responsibilities.
- Shared visual and transform properties can be reused in TypeScript types without collapsing the blocks.
- New blocks should be introduced only when they clarify ownership or authoring intent.

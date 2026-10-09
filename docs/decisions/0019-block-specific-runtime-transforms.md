# Decision 0019: Block-Specific Runtime Transforms

## Status

Accepted

## Context

Objects and spots are authored in separate scene blocks and are managed by separate runtime managers. Their identifiers are therefore independent, so an object and a spot may share the same identifier.

Shared transform methods would make a colliding identifier ambiguous and would hide the independent ownership of the object and spot blocks.

## Decision

Expose block-specific transform methods on `Presenter`:

- `getObjectTransform()` and `setObjectTransform()` for objects
- `getSpotTransform()` and `setSpotTransform()` for spots

Do not expose shared transform methods. Transform access should always name the block being addressed.

## Consequences

Authors can use sensible names independently within the object and spot blocks without losing deterministic runtime control. The public API mirrors scene ownership and avoids exposing the private managers. This supersedes the shared transform API described in Decision 0007.
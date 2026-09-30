# Decision 0010: Block-Scoped Entity Identifiers

## Status

Accepted

## Context

The scene authoring API separates models and geometry under `objects`, hotspots under `spots`, and other runtime resources such as lights under their own managers. A single identifier namespace made it impossible for an object and a spot to share a useful name, even though they have different semantics and runtime ownership.

## Decision

Identifiers are unique within each block or manager namespace, not globally across the viewer. Objects and spots may therefore use the same identifier. Runtime APIs provide explicit ownership:

- `presenter.addObject(id, definition)` and `presenter.removeObject(id)`
- `presenter.addSpot(id, definition)` and `presenter.removeSpot(id)`
- `presenter.lighting.setSceneLight()` and the lighting manager's light-specific APIs

There is no generic add/remove entity method. When an identifier exists in both the object and spot namespaces, callers use the block-specific API.

## Consequences

Block-specific APIs make creation and destruction unambiguous and align runtime ownership with scene authoring blocks.

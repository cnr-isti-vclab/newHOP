# Decision 0013: Spot Click Events

## Status

Accepted

## Context

3DHOP applications commonly assign `presenter.onSpotClicked` and receive a spot identifier when a hotspot is clicked. newHOP already has shared raycasting for picking, but navigation pointer events must not turn into hotspot activations after a drag.

## Decision

The Presenter exposes both forms:

- `onSpotClicked`, a compatibility callback receiving `(id, event)`.
- `on('spotclick', listener)` and `off('spotclick', listener)`, for multiple subscribers receiving a `SpotClickEvent`.

`SpotClickEvent` contains the stable spot `id`, world-space intersection `point`, owning Three.js `object`, and the original `PointerEvent`.

Spot events are resolved by the Presenter through the existing picking raycaster. They are dispatched only for primary-button clicks on hotspot entities. Pointer movement beyond the click threshold cancels activation so navigation drags do not trigger spots. Spot clicks do not depend on general picking mode.

## Consequences

The old 3DHOP authoring pattern remains short and source-compatible in spirit, while applications can adopt richer event data and multiple listeners. The Presenter owns the interaction semantic; `PickingManager` remains responsible for generic raycasting and picking-mode callbacks.

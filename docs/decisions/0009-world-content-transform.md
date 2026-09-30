# Decision 0009: World Content Transform

## Status

Accepted

## Context

Projects may need to align a collection of buildings or other authored entities to true north, a street grid, or another external reference. Rotating each model individually is repetitive, while rotating the entire viewer would also rotate navigation and reference helpers.

## Decision

Support an optional `world.sceneTransform` using the same component and matrix transform contract as entities. The transform is applied to the Presenter entity root, on top of each entity's own transform.

The content transform affects:

- Rendered entity positions and orientations
- Scene bounds and camera fitting
- Picking results
- Measurement results

The content transform does not affect:

- Camera or Trackball navigation
- Base grid and axes helpers
- Explicit world-space clipping planes
- Authored entity coordinates or stored entity transforms

A runtime `Presenter.setSceneTransform()` method updates the content root and refreshes bounds. `getSceneTransform()` exposes the current component or matrix mode snapshot.

## Consequences

A Z rotation can align buildings while the camera, grid, and section reference remain stable. Picked and measured points are reported in final transformed world coordinates. Applications that need local authored coordinates can apply the inverse scene transform themselves; an implicit coordinate conversion is intentionally avoided.

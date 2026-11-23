# ADR 0015: Shared Navigation Across Camera Projections

- Status: accepted
- Date: 2026-10-02

## Context

Three.js represents perspective and orthographic projections with separate camera classes, while newHOP navigation should remain independent of projection. Applications also need to switch projection without losing the current target or viewing direction.

## Decision

Presenter owns one perspective camera and one orthographic camera and renders through the active camera. Trackball stores the shared navigation viewpoint and updates whichever camera is active. Switching projections matches apparent scale at the current target plane using the perspective FOV as the conversion reference.

Projection configuration belongs to `world.camera` and can be changed through `Presenter.setCameraType()`, `getCameraProjection()`, and `setCameraProjection()`. Camera-dependent managers follow the active camera. Navigation configuration remains under `navigation`.

## Consequences

- Perspective remains the default and existing navigation viewpoints remain valid.
- Picking, measurement, lighting, fitting, and rendering work with either projection.
- Applications can switch projection without rebuilding the Presenter.
- The public `Presenter.camera` is now typed as the active `THREE.Camera`; projection-specific cameras are also available as `perspectiveCamera` and `orthographicCamera`.

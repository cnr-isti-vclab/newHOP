# ADR 0005: Switchable Navigation Modes

## Status

Accepted

## Decision

Keep `Trackball` as the shared navigation façade and support two mode-specific state models:

- `turntable` uses target, azimuth, elevation, and distance.
- `sphere` uses target, camera position, and quaternion as its canonical pose.

Sphere rotation uses an arcball interaction. Pan, zoom, fitting, projection changes, animation, touch gestures, and navigation observers remain shared operations. Sphere animation linearly interpolates target and position and uses quaternion slerp on one shared eased timeline.

Runtime switching from turntable to sphere captures the current camera pose exactly. Switching back preserves target, distance, and viewing direction, then derives an upright turntable orientation. Angular limits remain turntable constraints; sphere mode initially has no angular limits.

## Consequences

Existing turntable scenes and viewpoints remain compatible. Applications can select a mode in `navigation.type` or call `presenter.setNavigationMode()`. Sphere viewpoints are explicit camera poses and can be authored through a sphere home view or passed to viewpoint APIs.

When a viewpoint operation omits `mode`, it is interpreted using the currently active navigation mode. Explicit `mode` remains available when the operation should switch between state models. Sphere angular limits are intentionally not applied; its quaternion is the canonical orientation.

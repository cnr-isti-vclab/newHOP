# ADR 0007: Viewpoint Conversion Boundary

## Status

Accepted

## Decision

`getViewpoint()`, `setViewpoint()`, `jumpToViewpoint()`, and `animateToViewpoint()` use the precise canonical viewpoint representation for the active navigation mode. Human-readable orbit values, camera poses, and column-major 3x3 rotation matrices are handled by pure exported conversion helpers.

Sphere conversions preserve target, position, quaternion, and roll. Turntable conversions derive target, azimuth, elevation, and distance and canonicalize camera roll to the selected up axis because turntable state cannot represent arbitrary roll.

## Consequences

Navigation state has one unambiguous internal format, while applications can author and exchange views in formats suited to their workflows. Conversion functions do not mutate Trackball state and can be tested independently.

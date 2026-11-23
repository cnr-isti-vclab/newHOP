# Decision 0008: Configurable Y-Up and Z-Up Navigation

## Status

Accepted

## Context

Graphics projects commonly treat Y as vertical, while survey and engineering projects commonly treat Z as vertical. Rotating the entire scene to reconcile these conventions changes the coordinate system seen by picking, measurement, and application code.

## Decision

Support `navigation.upAxis` with the values `'y'` and `'z'`, defaulting to `'y'` for backward compatibility.

The selected axis controls:

- Trackball orbit and camera-viewpoint interpretation
- The camera up vector
- Base-grid plane, placement, and horizontal sizing

Meshes, entity transforms, object Euler rotations, picked points, and measurement results remain in their authored XYZ coordinate system. Explicit pan-limit fields remain literal world-axis `x`, `y`, and `z` ranges; they are not renamed or remapped by `upAxis`.

The axis is scene setup configuration. Runtime axis switching is not part of the initial API.

For Z-up navigation, azimuth 0 uses the negative Y direction as the front view. This keeps horizontal mouse rotation consistent with the existing Y-up interaction while using Z as the camera up axis.

## Consequences

Applications can use the same navigation and picking APIs for Y-up and Z-up data without applying a compensating transform to the whole scene. Existing scenes retain their behavior because Y-up is the default.

The camera and base grid must share one axis-aware basis. Future axis-sensitive features, such as semantic clipping defaults or fallback normals, should be evaluated separately rather than silently converting application coordinates.

# ADR 0005: Scene Rotation Values Use Degrees

- Status: accepted
- Date: 2026-09-17

## Context

Scene authors commonly specify object and spot orientations by hand. Three.js stores Euler rotations in radians, but radian expressions such as `Math.PI / 4` make declarative scene content harder to read and maintain.

## Decision

The `rotation` property in scene-authored objects, spots, and helpers uses Euler angles in degrees, ordered as `[x, y, z]`. The runtime converts these values to radians when applying them to Three.js objects.

## Consequences

- Scene descriptions are easier to author and review.
- The public scene convention is consistent across objects, spots, and helpers.
- Direct Three.js runtime mutation still uses radians, as required by Three.js.
- Existing scene definitions using radians must be converted to degrees.
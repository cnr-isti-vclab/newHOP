# ADR 0001: Turntable Is the Initial Supported Navigation Mode

- Status: superseded by ADR 0005
- Date: 2026-09-17

## Context

newHOP needs a stable navigation model for experiments and application integration. Turntable navigation has a clear state made of target, azimuth, elevation, and distance. Sphere navigation has different interaction and limit semantics and is not yet implemented distinctly.

## Decision

Treat `turntable` as the initial supported navigation mode. Keep its orbit state stable while leaving room for a distinct sphere state model.

Turntable viewpoints use:

```ts
{
  target,
  azimuth,
  elevation,
  distance
}
```

## Consequences

- The initial API was intentionally turntable-focused.
- Sphere navigation is now documented separately in ADR 0005 and the navigation reference.

# ADR 0001: Turntable Is the Initial Supported Navigation Mode

- Status: accepted
- Date: 2026-09-17

## Context

newHOP needs a stable navigation model for experiments and application integration. Turntable navigation has a clear state made of target, azimuth, elevation, and distance. Sphere navigation has different interaction and limit semantics and is not yet implemented distinctly.

## Decision

Treat `turntable` as the supported navigation mode for now. Keep `sphere` in the type system as a reserved option, but do not promise behavioral compatibility between the two modes.

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

- The current documentation can describe one coherent state model.
- `homeView`, limits, speed, reset, jump, animation, and subscriptions can be validated against turntable behavior.
- Sphere navigation may later require different viewpoint, limit, and interaction types.
- Existing public names should be revisited when sphere support begins rather than forcing an artificial shared abstraction.

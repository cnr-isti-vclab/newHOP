# ADR 0002: Runtime Navigation Mutators Belong to Trackball

- Status: accepted
- Date: 2026-09-17

## Context

Navigation is configured in scene blocks, but applications also need to change it at runtime. Presenter-level wrappers created inconsistent names and made it unclear which object owned navigation state.

## Decision

Keep navigation configuration and its runtime mutators on `Trackball`. Mutators use the same shapes as scene configuration:

```ts
trackball.setHomeView(homeView);
trackball.setLimits(limits);
trackball.setSpeed(speed);
```

The Presenter may expose navigation actions and observation convenience methods, but it does not duplicate configuration mutators.

## Consequences

- Scene configuration and runtime updates are easy to compare.
- Trackball owns its state, validation, clamping, and change notifications.
- `reset()` is the semantic action for returning to `homeView`.
- `jumpToViewpoint()` and `animateToViewpoint()` remain generic movement operations.

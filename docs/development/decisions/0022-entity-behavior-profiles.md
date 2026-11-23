# Decision 0022: Entity Behavior Profiles

- Status: accepted
- Date: 2026-10-16

## Context

newHOP entities can be imported models, Gaussian splats, hotspots, or procedural Three.js geometry. Construction source does not determine whether an object contributes to scene mechanics. A procedural object may be a normal shaded scene object, a helper, or an overlay gizmo. A collection of independent participation flags would make common declarations difficult to read.

## Decision

Entities use a named behavior profile to group their participation in scene bounds, clipping, generic picking, and distance measurement. The initial profiles are:

- `scene`: participates in all four mechanisms.
- `helper`: excluded from bounds and measurement, but remains normal scene geometry for clipping and picking.
- `overlay`: excluded from bounds, clipping, picking, and measurement.
- `interactive-helper`: excluded from bounds, clipping, and measurement, but remains pickable.

A small `participation` override is available for exceptional cases. Profiles control viewer mechanics; rendering remains independent, so a geometry entity may use standard shaded materials, simple unlit materials, or a custom shader.

## Consequences

- Imported and procedural geometry share identity, visibility, transforms, and lifecycle behavior.
- Picking, measurement, clipping, and bounds can use one normalized policy instead of separate historical categories.
- Gizmos can remain lightweight without being forced into model rendering assumptions.
- Dynamic geometry can retain its entity identity while its buffers change.
- Existing entities default to `scene` behavior. Legacy `clippable` and `measurable` values override the corresponding profile fields during normalization.

# Decision 0012: Focused Spot Visual Contract

## Context

Spots are three-dimensional hotspots and annotations, not general scene objects. They need a compact configuration that is easy to author while remaining distinct from object material and appearance controls. Built-in primitives are useful for the common case, but some hotspots need custom silhouettes or imported marker geometry.

## Decision

Keep spots in their own namespace and runtime manager. A spot may provide one of a built-in primitive, supplied BufferGeometry, or a PLY/OBJ file. Share useful visual and transform fields with objects: color, alpha, transparency, face visibility, visibility, tags, clipping, measurement participation, and transforms. Spot appearance additionally supports optional highlighted color/alpha values and a highlighted state. Spot primitives and imported geometry do not expose object-only material modifiers such as `uniform`, `shadeless`, or material declarations.

Spot content always uses a basic, unlit material. Their `transparent` and `doubleSided` values directly control that material. Spots are transparent by default with a default alpha of `0.7`; a highlighted state selects `highlightColor` and `highlightAlpha` when provided.

## Consequences

- A sphere or cube hotspot remains useful with minimal configuration: `primitive`, `size`, and `position` are sufficient.
- A custom PLY/OBJ or BufferGeometry hotspot retains the same placement and appearance API as a primitive spot.
- Spot behavior is easy to understand without inheriting the full object appearance model.
- Objects can still be used as custom hotspot visuals when a scene needs authored geometry or material behavior.

# newHOP Roadmap

This is a working plan, not a promise of release dates. Keep entries small enough to validate in an example.

## Current Baseline

- Trackball navigation supports switchable turntable and full-sphere modes.
- Scene blocks are established for config, world, navigation, lighting, helpers, objects, and spots.
- Navigation has home view, limits, speed, runtime control, status subscriptions, reset, viewpoint animation, input locking, and double-click recentering.
- Navigation supports Y-up and Z-up scenes without rewriting authored mesh or entity coordinates.
- Scene loading updates bounds and extent helpers incrementally, with a final `onSceneReady()` signal after all entities are ready.
- World content transforms align authored entities without rotating the navigation/reference frame.
- Model loading supports Nexus, GLB/GLTF, PLY, OBJ, and STL.
- GLB/GLTF clips are retained by name, with per-object playback, pause/resume/stop, declaration-time autoplay, time-based scrubbing, and frame-accurate playback-state listeners.
- Static HTML documentation covers navigation, objects, and spots.
- Static HTML documentation includes an Interaction reference covering tool ownership and the intended picking and click contracts.
- The basic Toolbar includes an optional `pickpoint` control with an attached object ID and coordinate readout.
- Auxiliary interaction modes include configurable pickpoint feedback through `setInteractionMode(mode, options?)`.
- Entity behavior profiles currently control bounds, clipping, generic picking, and distance measurement for imported, hotspot, and procedural entities.

## Next Priorities

### Navigation

- Add focused tests for limits, home view, animation interruption, subscriptions, and double-click recentering.
- Improve the turntable interaction model based on real application experiments.
- Decide whether named viewpoints should extend the existing save/restore API.
- Add focused tests for sphere arcball math, mode conversion, pose animation, sphere home views, and Y-up/Z-up pole conversions.

### Scene Blocks

- Document and validate the remaining `world` and `lighting` properties.
- Document helpers and their scene-extent behavior.
- Design a top-level `config` block for viewer behavior and presentation, distinct from the scene content managed by the viewer. Define ownership for renderer and shadow policy, measurement and picking appearance, and optional UI behavior; keep the public schema capability-oriented rather than exposing arbitrary Three.js properties.
- Decide which viewer settings belong in `Presenter` construction, scene loading, or runtime methods, and consider an explicitly advanced Three.js escape hatch only after the stable configuration surface is defined.
- Decide how remaining reserved visual flags such as `clippable` and `measurable` should become operational.
- Extend runtime transform APIs only if later use cases require additional constraints or animation support.

### Unified Entities and Procedural Geometry

- Extend the entity model so imported models, Three.js primitives, custom buffer geometry, dynamic geometry, and gizmos share identity, visibility, transforms, and lifecycle management.
- Add runtime APIs for mutating or replacing procedural geometry while preserving entity identity, interaction state, and disposal ownership.
- Support simple unlit materials and custom shaders for gizmos, while allowing standard shaded materials for intermediate procedural scene geometry.
- Define and document dynamic geometry bounds refresh and renderer update behavior.
- Add an example covering a shaded procedural object, a dynamic polyline or grid, and an overlay gizmo using the existing behavior profiles.

### Clipping and Section Planes

- The initial implementation provides three independently enabled, axis-aligned open section planes. Relative positions use normalized scene bounds and absolute positions use world-space coordinates.
- Mesh objects are required to support clipping. Primitive lines and points participate when their materials support Three.js clipping; Gaussian-splat clipping remains optional.
- Helpers, gizmos, and measurement graphics remain outside clipping through participation policy and dedicated overlay roots.
- Keep plane movement cheap by updating persistent shader planes and shared active-plane state without CPU geometry slicing or per-move scene traversal.
- The initial toolbar exposes per-axis enable/invert controls and a global section-plane visibility toggle; keep visual helpers outside bounds, clipping, picking, and measurement.
- Defer per-object opposite-side clipping for before/after comparisons, solid caps, translucent discarded halves, and oblique planes until the axis-aligned open workflow is stable.

### Model Animation

- Add focused tests for clip discovery, clip selection, duration clamping, mixer lifecycle, declaration-time autoplay, and repeated or skinned model instances.
- Decide whether frame-based seeking is needed in addition to the implemented seconds-based seeking; glTF clips do not reliably carry a source frame rate.
- Add focused tests for pingpong effective-time mapping, resume behavior, listener lifecycle, and listener updates during scrubbing.

### Tools and UI

- Add examples for compass and minimap observers using `onNavigationChange`.
- Add focused browser coverage for the object-only, drag-qualified generic picking contract described in `docs/interaction.html`.
- Improve Toolbar customization and accessibility.

### Quality and Collaboration

- Add automated browser checks for minimal and advanced examples.
- Add unit tests for pure navigation math and limit normalization.
- Carefully review scene disposal for both in-place scene reset and permanent Presenter/viewer removal, including animation mixers, event listeners, renderer resources, and overlapping asynchronous scene loads.
- Add a pull-request checklist and CI workflow after the shared GitHub repository is created.
- Keep generated bundles out of hand-edited workflows and document release generation.

### Repository Preparation

- Finish a small set of tests, examples, and documentation improvements before creating the public repository.
- Decide whether newHOP should use MIT or GPLv3 based on the intended reuse and contribution model; ownership of 3DHOP does not by itself determine the newHOP license.
- Review the licenses and redistribution rights for bundled model and image assets separately from the source-code license.
- Define the first repository snapshot, including whether generated minimal bundles and large demonstration assets belong in Git.

## Open Questions

- Should runtime state updates emit a richer event with source and phase, or is `TrackballStatus` sufficient?
- Should `reset()` support an optional animation duration?
- Should scene-block types expose more explicit mode-specific home-view unions while preserving the current shared navigation block?
- Which object and spot properties should be strict errors when they are currently only reserved?
- Should animation playback be object-level only, or should a later API support synchronized timelines across multiple objects?
- What default FPS, if any, should frame-based seeking use when the caller does not provide one?

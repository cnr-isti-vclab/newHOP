# newHOP Architecture

newHOP is a TypeScript and three.js successor to 3DHOP. It provides a Presenter for scene setup and a set of focused managers for loading, navigation, picking, measurement, clipping, lighting, and UI.

## Audience Levels

newHOP is middleware for third parties that build interactive 3D visualizations. The project distinguishes three use levels:

- **Developer**: builds and maintains the newHOP source, then produces the distributable library and related bundles.
- **Author**: consumes the distributed library to author a visualization application, typically a webpage with scene data, controls, and application-specific behavior.
- **User**: accesses and interacts with the completed visualization webpage.

This distinction is normative when discussing requirements and behavior. Library types, scene schemas, runtime APIs, defaults, and authoring documentation primarily serve authors; source organization, build output, tests, and architectural rules primarily serve developers; navigation, feedback, interaction, accessibility, and visible errors experienced in a finished page serve users. A change may affect more than one level, but its intended level should be clear when the distinction affects design or validation.

## Runtime Shape

```text
Presenter
  |-- Trackball
  |-- ObjectManager (EntityManager) -> ModelLoader
  |-- SpotManager (EntityManager)
  |-- PickingManager
  |-- MeasurementManager
  |-- InteractionManager
  |-- ClippingManager
  |-- LightingManager
  |-- Toolbar (optional)
  |-- scene / camera / renderer
```

The Presenter owns the scene lifecycle and coordinates managers. Managers own focused behavior and should not reach into unrelated managers. `InteractionManager` owns the single auxiliary interaction mode (`none`, `pickpoint`, or `distance`) and routes click-qualified pointer events to only the active tool; navigation remains independent and always active. Picking owns an optional single-point feedback overlay attached to a dedicated Presenter overlay root, keeping it out of scene raycasts and helper resets. Applications activate tools with `setInteractionMode(mode, options?)`; each mode closes and cleans the previous mode before initialization. UI components such as `Toolbar` are optional API clients: they are distributed separately from the Presenter class, and applications may replace them with custom controls that call the same public methods. The package version is exported as `VERSION` and logged to the browser console whenever a Presenter is constructed.

## Defaults and Runtime State

As a preferred convention, configurable features should place readable defaults structures near the beginning of the owning module. An exported defaults structure mirrors the author-facing option declaration shape and contains only parameters authors can set at declaration time or runtime; fixed implementation constants preferably belong in a separate private structure or grouped private constants. Defaults are the reference point for initialization and, where possible, runtime update normalization; fallback values should not be duplicated as unrelated literals across constructors and setters. This convention is advisory rather than blocking when another structure is clearer or more practical. The author-configurable pickpoint and distance defaults are available as the exported `PICKING_DEFAULTS` and `MEASUREMENT_DEFAULTS` structures; navigation and its visualizer use `TRACKBALL_DEFAULTS` and `TRACKBALL_GIZMO_DEFAULTS`.

The renderer enables antialiasing and shadow maps by default. Pass `shadows: false` to the `Presenter` constructor to disable shadow rendering for lightweight scenes. Runtime meshes cast and receive shadows automatically; individual scene lights opt into shadow casting with `castShadow: true`. The Presenter owns spot click semantics: it resolves hotspot entities through the shared picking raycaster and dispatches only completed primary-button clicks, keeping navigation drags from activating spots. Applications can use the compatibility `onSpotClicked` callback or the `spotclick` subscription event. The public interaction responsibilities and pointer ownership are summarized in [`docs/interaction.html`](interaction.html); generic object picking is being separated from the scene-wide raycast used by spot clicks and double-click recentering.

## Scene Description

Scene authoring is divided into named blocks:

- `config`: general viewer behavior.
  - `world`: background, camera, and optional authored-content transform.
- `navigation`: turntable or full-sphere navigation configuration.
- `lighting`: world lights and camera-relative flashlight.
- `helpers`: axes, grid, and scene extent helpers.
- `objects`: loaded models, Gaussian splats, or supplied Three.js geometry.
- `spots`: hotspot markers kept separate from objects.

Objects and spots are keyed by identifier. Identifiers must be unique within each block, but an object and a spot may use the same identifier because they have separate runtime namespaces. Runtime creation mirrors declaration syntax: use `presenter.addObject(id, definition)`/`removeObject(id)` and `presenter.addSpot(id, definition)`/`removeSpot(id)` for explicit runtime ownership; there is no generic add/remove entity method. Spots may use a built-in primitive, supplied BufferGeometry, or a PLY/OBJ file. Custom spot sources are converted to unlit materials. Spots intentionally have their own small visual contract: color, alpha, optional highlight color/alpha, highlighted state, transparency, face visibility, visibility, tags, clipping, and measurement participation. Object-only material modifiers such as `uniform` and `shadeless` do not apply to spots.

The `lighting` block accepts ambient, hemisphere, directional, point, and spot lights as a keyed collection, plus an optional camera-mounted directional flashlight. Each scene light supports an `enabled` property, which defaults to `true`; lights can also be changed at runtime. `presenter.lighting.getSceneLight(id)` and `setSceneLight(id, definition)` use the same `SceneLightDefinition` shape as scene creation. Flashlight parameters can be read with `getFlashlight()` and changed with `setFlashlight()`. Flashlight orientation is exposed as degree-based `getFlashlightOrientation()`/`setFlashlightOrientation(azimuth, elevation)` methods. The angles are camera-relative: zero points along the camera's current forward direction, azimuth turns within the camera view, and elevation turns above or below that view. This keeps the flashlight aligned when the camera orbits in either Y-up or Z-up navigation. `presenter.setFlashlightMode(true)` temporarily gives left-button dragging to flashlight aiming instead of navigation, and `setFlashlightMode(false)` restores navigation. Lighting rotations and cone angles are authored in degrees and converted to Three.js radians internally. A hemisphere light uses its position to establish the sky direction; the default Y-up position is `[0, 1, 0]`. The collection key is the light ID used by runtime controls; named scene lights can be switched with `presenter.lighting.setSceneLightEnabled(id, enabled)` and inspected with `isSceneLightEnabled()` or `getSceneLightIds()`.

```ts
lighting: {
  lights: {
    fill: { type: 'hemisphere', intensity: 1.1 },
    key: { type: 'directional', intensity: 2, position: [500, 900, 700] }
  }
}
```

Scene-authored object, spot, and helper rotations use Euler angles in degrees, ordered as X, Y, Z. The runtime converts them to Three.js radians at the scene boundary. Mesh coordinates and entity transforms are never rewritten to accommodate the scene's vertical-axis convention.

Entities may also provide a column-major 4x4 `matrix`, matching `THREE.Matrix4.toArray()`. When present, it overrides `position`, `rotation`, and `scale`. Loaded OBJ, PLY, and Nexus entities render double-sided by default; `doubleSided: false` selects front-face rendering, and the block-specific appearance APIs change the setting at runtime: `presenter.setObjectAppearance(id, { doubleSided: enabled })` or `presenter.setSpotAppearance(id, { doubleSided: enabled })`. Default Standard materials for Nexus, PLY, STL, and geometry use `roughness: 0.55` and `metalness: 0` so directional lights produce moderate highlights. GLB/GLTF materials retain their embedded glTF material settings.

The optional `world.sceneTransform` applies one additional transform to all authored entities in the content root. It affects rendered positions, scene bounds, picking, and measurements, but does not transform the camera, base grid, axes helper, or explicit world-space section planes. This makes it possible to align buildings to true north or a street grid while keeping the navigation reference stable. World camera projection supports perspective or orthographic mode; navigation remains projection-independent and preserves the shared target and viewing direction when switching modes. Turntable navigation also accepts one-finger orbit, two-finger pan, and pinch zoom on touch devices; two-finger twist is ignored.

```ts
world: {
  sceneTransform: {
    rotation: [0, 0, 20]
  }
}
```

The transform can also be changed at runtime with `presenter.setSceneTransform(update)` and inspected with `presenter.getSceneTransform()`.

Runtime object transforms are accessed through `Presenter.getObjectTransform(id)` and changed through `Presenter.setObjectTransform(id, update)`. Spot transforms use the corresponding `getSpotTransform()` and `setSpotTransform()` methods. Transform APIs are block-specific because objects and spots have independent namespaces. The returned read-only `mode` is `components` or `matrix`; in matrix mode, position, rotation, and scale are inactive identity placeholders. Supplying component fields after matrix mode switches from identity components without decomposing the matrix. These methods keep the live Three.js object and the stored entity definition synchronized.

Objects and spots are separate entity classes with dedicated blocks and APIs. They intentionally share some property shapes and implementation behavior, but the public API preserves their different purposes rather than merging them into a generic entity surface. Object appearance is grouped similarly: `getObjectAppearance(id)` returns effective `visible`, `uniform`, `color`, `transparent`, `alpha`, `shadeless`, and `doubleSided` values, while `setObjectAppearance(id, update)` accepts a partial update. Object defaults are `uniform: false`, `color: 0xffffff`, `transparent: false`, and `alpha: 0.5`. These values are independent modifiers over authored file materials: `uniform` temporarily replaces source textures and vertex colors with `color`, while color remains inactive otherwise; `transparent` enables blending and applies `alpha`, while alpha remains inactive otherwise. Neither modifier changes the other mode. `shadeless` temporarily switches to an unlit material. Original material state is retained so these modifiers can be reversed without losing authored model appearance. Nexus materials retain their texture and vertex-color inputs when transparent mode is enabled; their placeholder color attribute is normalized to RGB so its unused alpha component cannot suppress the material. This API intentionally targets objects only; spots keep their own visual shape and controls.

Object declarations may also include a serializable `material` block for properties such as `roughness`, `metalness`, `specularColor`, `shininess`, `emissive`, and `envMapIntensity`. `getObjectMaterial(id)` reads common values across all materials in an object and `setObjectMaterial(id, update)` applies partial overrides to them. Authored GLB/GLTF material values remain the baseline, and unsupported properties are ignored per material.

Current block contents can be enumerated without merging namespaces: `presenter.getObjectIds()`, `presenter.getSpotIds()`, `presenter.getHelperIds()`, and `presenter.getSceneLightIds()` return the currently present names for their respective blocks.

## Navigation

`Trackball` is the shared navigation façade. `turntable` provides constrained two-axis orbit, while `sphere` provides full-sphere arcball rotation. Both modes share pan, zoom, fitting, projection switching, touch input, viewpoint animation, and observers. Runtime mode switching preserves the camera pose when entering sphere mode. Returning to turntable preserves target, distance, and direction while canonicalizing roll to the configured up axis. Navigation can also expose an optional non-pickable, depth-tested `trackball` overlay centered on the live target; the overlay is kept separate from scene helpers and does not affect bounds, clipping, measurement, or picking. Navigation supports `upAxis: 'y' | 'z'`, defaulting to Y-up. The selected axis controls camera orbit semantics, camera up orientation, and base-grid orientation; it does not convert mesh, picking, or measurement coordinates. Two-finger twist is currently ignored in both navigation modes.

The canonical turntable viewpoint is:

```ts
{
  target: [number, number, number],
  azimuth: number,
  elevation: number,
  distance: number
}
```

The canonical sphere viewpoint is an absolute camera pose with `target`, `position`, and a Three.js-order `quaternion`. If no sphere home view is authored, Trackball derives an axis-compatible default pose from `upAxis`. Sphere animation interpolates target and position linearly and quaternion orientation with slerp on one shared eased timeline; the three components finish together.

Viewpoint operations retain the current navigation mode when `mode` is omitted. Supplying `mode` explicitly requests conversion or switching to the other state model.

The package also exports pure viewpoint converters for orbit, camera-pose, and column-major 3x3 matrix forms. These converters are intentionally outside `getViewpoint()` and `setViewpoint()` so canonical state remains unambiguous and conversion never mutates navigation state. Orbit-to-sphere conversion uses the configured `upAxis`, including at exact turntable poles where azimuth determines camera roll.

Navigation configuration is grouped into `homeView`, `limits`, and `speed`. Runtime configuration changes belong to `Trackball` and use the same structures as scene configuration:

```ts
trackball.setHomeView(homeView);
trackball.setLimits(limits);
trackball.setSpeed(speed);
```

`reset()` returns to `homeView`. `jumpToViewpoint()` and `animateToViewpoint()` move to arbitrary viewpoints. `onChange()` provides synchronized status updates to compass, minimap, and other observers.

In the turntable input model, left-button dragging rotates, while Shift + left-button, middle-button, and right-button dragging pan. A stationary right-button click leaves the browser context menu available; the menu is suppressed only after a right-button drag. The mouse wheel controls zoom. Touch uses one-finger orbit, two-finger pan, and pinch zoom; twist is ignored.

The default elevation range is `[-90, 90]`. Elevation limits may include the exact poles `-90` and `90`; at a pole, azimuth still determines camera roll and therefore the camera's up vector, even though it no longer changes the camera position.

## Scene Loading

Model formats currently supported by `ModelLoader` are Nexus (`.nxz`, `.nxs`), GLB/GLTF, PLY, OBJ, and STL. Nexus loads asynchronously and uses the Corto worker. Built libraries discover the worker beside their own script or module URL; during source-based Vite development, the worker is served at `/nexus3d/corto.em.js`. Objects with `type: 'splat'` use Spark's `SplatMesh` loader for Gaussian-splat PLY files; one shared `SparkRenderer` is added lazily to the scene. Splats retain object transforms, visibility, tags, scene bounds, and runtime removal, but do not participate in mesh material or GLB animation controls.

GLB/GLTF animation clips are retained by name. Clips without a glTF name are exposed as `Animation 1`, `Animation 2`, and so on. Each animated object owns its `THREE.AnimationMixer`; the Presenter updates active mixers from render-loop delta time and disposes them with the object. Runtime controls include clip discovery, play, pause, resume, stop, and time-based scrubbing with `once`, `loop`, and `pingpong` modes. `getObjectAnimationTime()` and `onObjectAnimationUpdate()` expose effective clip time, including the corrected forward/reverse time mapping for pingpong playback. An object's `animation.clip` is optional for autoplay; when omitted, the first clip is selected.

Scene objects and spots are loaded concurrently. This prevents a slow Nexus stream from blocking other models, spots, or helpers from appearing. Explicit navigation home views are applied before entity loading completes, so a scene can present its authored camera immediately while model bounds continue to arrive.

Applications can subscribe to final scene readiness with `presenter.onSceneReady(listener)`. The listener runs once after all entity loads finish, final scene bounds are computed, and the final home view is applied. The returned function removes the listener. The `setScene()` promise remains available for one-shot `await`-based loading flows.

```ts
const unsubscribe = presenter.onSceneReady(() => {
  enableSceneActions();
  console.log('Scene ready', presenter.getSceneBounds());
});

await presenter.setScene(sceneDescription);
unsubscribe();
```

Scene bounds are computed from transformed objects, Gaussian splat bounds, and Nexus bounding spheres; spots have separate manager bounds for local queries but do not affect scene framing. Bounds are refreshed when objects finish loading, are removed, or receive runtime transform updates. Registered scene-extent helpers and base grids follow those refreshed bounds, including while entities are arriving asynchronously. The load-time fit supplies the default Home viewpoint only when no authored `homeView` is present; runtime `presenter.fitToScene(direction?, recenter?, duration?)` preserves the current direction by default, can recenter on the scene, and optionally animates without replacing Home. Requested directions are clamped by navigation limits. Automatic fitting respects navigation limits.

## Bundles and Examples

The library builds as:

- ESM: `dist/newhop.js`
- global bundle: `dist/newhop.global.js`
- Nexus worker beside the bundles: `dist/corto.em.js`
- minimal publishable library: `minimal/lib/newhop.global.js`
- minimal Nexus worker: `minimal/lib/corto.em.js`

Examples remain plain HTML/JavaScript and import the TypeScript source during development.

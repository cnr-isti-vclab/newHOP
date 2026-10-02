# newHOP Architecture

newHOP is a TypeScript and three.js successor to 3DHOP. It provides a Presenter for scene setup and a set of focused managers for loading, navigation, picking, measurement, clipping, lighting, and UI.

## Runtime Shape

```text
Presenter
  |-- Trackball
  |-- ObjectManager (EntityManager) -> ModelLoader
  |-- SpotManager (EntityManager)
  |-- PickingManager
  |-- MeasurementManager
  |-- ClippingManager
  |-- LightingManager
  |-- Toolbar (optional)
  |-- scene / camera / renderer
```

The Presenter owns the scene lifecycle and coordinates managers. Managers own focused behavior and should not reach into unrelated managers. UI components such as `Toolbar` are optional API clients: they are distributed separately from the Presenter class, and applications may replace them with custom controls that call the same public methods.

The renderer enables antialiasing and shadow maps by default. Pass `shadows: false` to the `Presenter` constructor to disable shadow rendering for lightweight scenes. Runtime meshes cast and receive shadows automatically; individual scene lights opt into shadow casting with `castShadow: true`. The Presenter owns spot click semantics: it resolves hotspot entities through the shared picking raycaster and dispatches only completed primary-button clicks, keeping navigation drags from activating spots. Applications can use the compatibility `onSpotClicked` callback or the `spotclick` subscription event.

## Scene Description

Scene authoring is divided into named blocks:

- `config`: general viewer behavior.
  - `world`: background, camera, and optional authored-content transform.
- `navigation`: turntable navigation configuration.
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

Entities may also provide a column-major 4x4 `matrix`, matching `THREE.Matrix4.toArray()`. When present, it overrides `position`, `rotation`, and `scale`. Loaded OBJ, PLY, and Nexus entities render double-sided by default; `doubleSided: false` selects front-face rendering, and `presenter.setEntityDoubleSided(id, enabled)` changes the setting at runtime. Default Standard materials for Nexus, PLY, STL, and geometry use `roughness: 0.55` and `metalness: 0` so directional lights produce moderate highlights. GLB/GLTF materials retain their embedded glTF material settings.

The optional `world.sceneTransform` applies one additional transform to all authored entities in the content root. It affects rendered positions, scene bounds, picking, and measurements, but does not transform the camera, base grid, axes helper, or explicit world-space section planes. This makes it possible to align buildings to true north or a street grid while keeping the navigation reference stable. World camera projection supports perspective or orthographic mode; navigation remains projection-independent and preserves the shared target and viewing direction when switching modes.

```ts
world: {
  sceneTransform: {
    rotation: [0, 0, 20]
  }
}
```

The transform can also be changed at runtime with `presenter.setSceneTransform(update)` and inspected with `presenter.getSceneTransform()`.

Runtime entity transforms are accessed through `Presenter.getEntityTransform(id)` and changed through `Presenter.setEntityTransform(id, update)`. The returned read-only `mode` is `components` or `matrix`; in matrix mode, position, rotation, and scale are inactive identity placeholders. Supplying component fields after matrix mode switches from identity components without decomposing the matrix. These methods keep the live Three.js object and the stored entity definition synchronized. Direct access through `getEntityObject(id)` remains available for advanced Three.js manipulation.

Object appearance is grouped similarly: `getObjectAppearance(id)` returns effective `visible`, `uniform`, `color`, `transparent`, `alpha`, `shadeless`, and `doubleSided` values, while `setObjectAppearance(id, update)` accepts a partial update. Object defaults are `uniform: false`, `color: 0xffffff`, `transparent: false`, and `alpha: 0.5`. These values are independent modifiers over authored file materials: `uniform` temporarily replaces source textures and vertex colors with `color`, while color remains inactive otherwise; `transparent` enables blending and applies `alpha`, while alpha remains inactive otherwise. Neither modifier changes the other mode. `shadeless` temporarily switches to an unlit material. Original material state is retained so these modifiers can be reversed without losing authored model appearance. This API intentionally targets objects only; spots keep their own visual shape and controls.

Object declarations may also include a serializable `material` block for properties such as `roughness`, `metalness`, `specularColor`, `shininess`, `emissive`, and `envMapIntensity`. `getObjectMaterial(id)` reads common values across all materials in an object and `setObjectMaterial(id, update)` applies partial overrides to them. Authored GLB/GLTF material values remain the baseline, and unsupported properties are ignored per material.

Current block contents can be enumerated without merging namespaces: `presenter.getObjectIds()`, `presenter.getSpotIds()`, `presenter.getHelperIds()`, and `presenter.getSceneLightIds()` return the currently present names for their respective blocks.

## Navigation

`turntable` is the supported navigation mode. `sphere` is reserved for a future navigation model and should not be treated as feature-complete. Navigation supports `upAxis: 'y' | 'z'`, defaulting to Y-up. The selected axis controls camera orbit semantics, camera up orientation, and base-grid orientation; it does not convert mesh, picking, or measurement coordinates.

The canonical turntable viewpoint is:

```ts
{
  target: [number, number, number],
  azimuth: number,
  elevation: number,
  distance: number
}
```

Navigation configuration is grouped into `homeView`, `limits`, and `speed`. Runtime configuration changes belong to `Trackball` and use the same structures as scene configuration:

```ts
trackball.setHomeView(homeView);
trackball.setLimits(limits);
trackball.setSpeed(speed);
```

`reset()` returns to `homeView`. `jumpToViewpoint()` and `animateToViewpoint()` move to arbitrary viewpoints. `onChange()` provides synchronized status updates to compass, minimap, and other observers.

In the turntable input model, left-button dragging rotates, while Shift + left-button, middle-button, and right-button dragging pan. A stationary right-button click leaves the browser context menu available; the menu is suppressed only after a right-button drag. The mouse wheel controls zoom.

The default elevation range is `[-70, 70]`. Author-requested pole limits such as `[-90, 90]` are stabilized internally with a small epsilon to avoid pole singularities.

## Scene Loading

Model formats currently supported by `ModelLoader` are Nexus (`.nxz`, `.nxs`), GLB/GLTF, PLY, OBJ, and STL. Nexus loads asynchronously and uses the Corto worker served by Vite at `/nexus3d/corto.em.js`. Objects with `type: 'splat'` use Spark's `SplatMesh` loader for Gaussian-splat PLY files; one shared `SparkRenderer` is added lazily to the scene. Splats retain object transforms, visibility, tags, scene bounds, and runtime removal, but do not participate in mesh material or GLB animation controls.

GLB/GLTF animation clips are retained by name. Each animated object owns its `THREE.AnimationMixer`; the Presenter updates active mixers from render-loop delta time and disposes them with the object. Runtime controls include clip discovery, play, pause, stop, and time-based scrubbing with `once`, `loop`, and `pingpong` modes.

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
- minimal publishable library: `minimal/lib/newhop.global.js`

Examples remain plain HTML/JavaScript and import the TypeScript source during development.

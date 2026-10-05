# newHOP

newHOP is a TypeScript and Three.js framework for interactive 3D heritage presentations. It is a modern successor to the 3DHOP approach: scene content is described declaratively, while a central presenter coordinates rendering, navigation, loading, interaction, and runtime control.

The project supports ordinary 3D models, Gaussian splats, supplied Three.js geometry, and interactive hotspot objects. It is intended for browser-based presentations that can run during development with Vite or be deployed as a self-contained local application, including offline museum kiosk installations.

## Project Basis

newHOP is built around a small set of focused runtime components:

- `Presenter` owns the Three.js scene, camera, renderer, lifecycle, and public runtime API.
- `EntityManager` owns object and spot collections, transforms, visibility, appearance, bounds, and disposal.
- `ModelLoader` loads Nexus, GLB/GLTF, PLY, OBJ, and STL model files.
- Spark provides Gaussian-splat rendering for objects declared with `type: 'splat'`.
- `Trackball` provides turntable navigation with authored viewpoints, limits, and runtime animation.
- Picking, measurement, clipping, lighting, and toolbar behavior are provided by focused managers.

Scene declarations are organized into independent blocks such as `world`, `navigation`, `lighting`, `helpers`, `objects`, and `spots`. Objects and spots have separate runtime namespaces.

## Requirements

- Node.js with npm
- A browser with WebGL support

Install dependencies from the project root:

```text
npm install
```

## Development

Start the Vite development server:

```text
npm run dev -- --host 127.0.0.1
```

Then open the URL reported by Vite. The root page lists the available examples.

Useful examples include:

- `examples/minimal.html` - basic viewer setup
- `examples/advanced.html` - models, transforms, tools, clipping, picking, and measurement
- `examples/animation.html` - GLB animation playback
- `examples/splats.html` - Gaussian splat loading with `well_splat.ply`
- `examples/turntable.html` - runtime navigation controls
- `examples/lighting.html` - scene lights and flashlight controls

## Building

Run the complete validation and build pipeline:

```text
npm run typecheck
npm run build
```

The build produces:

- `dist/newhop.js` - ESM library build
- `dist/newhop.global.js` - self-contained browser global build
- `dist/corto.em.js` - Nexus3D worker beside the built library
- `minimal/lib/newhop.global.js` - refreshed minimal deployment bundle
- `minimal/lib/corto.em.js` - refreshed Nexus3D worker beside the minimal bundle

The ESM build externalizes Three.js for application bundlers. The global build bundles Three.js and Spark support, making it suitable for a simple browser deployment without CDN dependencies.

## Basic Scene

A scene can declare a model and shared navigation settings like this:

```ts
import { Presenter } from './src/index.ts';

const presenter = new Presenter({ mount: 'viewer' });

await presenter.setScene({
  world: {
    background: 0x202b3c
  },
  navigation: {
    type: 'turntable',
    homeView: {
      target: [0, 0, 0],
      azimuth: 35,
      elevation: 18,
      distance: 4
    }
  },
  objects: {
    model: {
      file: 'models/example.glb',
      position: [0, 0, 0]
    },
    scan: {
      type: 'splat',
      file: 'models/example.ply',
      rotation: [0, 0, 180]
    }
  }
});
```


## Offline Deployment

For a fully local kiosk deployment, serve `minimal/` over HTTP. It can be deployed at the site root or under a subdirectory:

```text
minimal/
  index.html
  lib/
    newhop.global.js
    corto.em.js          # required when Nexus models are used
  models/
```

Gaussian splat scenes need the global bundle and their local `.ply` files. newHOP locates the Nexus worker beside the loaded library, so the complete `minimal/` folder can be served from a subdirectory or renamed without path configuration. The build refreshes both generated files in `minimal/lib/`; keep `index.html` and model assets there. No internet connection, CDN, npm installation, or Node.js runtime is required after the bundle has been built.

## Documentation

- [Object authoring](docs/objects.html)
- [Navigation](docs/navigation.html)
- [Spots](docs/spots.html)
- [Architecture](docs/architecture.md)
- [Contributing](docs/contributing.md)
- [Roadmap](docs/roadmap.md)
- [Architecture decisions](docs/decisions/)

## Repository Notes

`dist/` and `node_modules/` are generated or installed content. The `examples/models/` directory contains regular development assets, while `examples/large_assets/` contains larger local assets. Large Gaussian-splat and Nexus files should be reviewed before committing them to a public Git repository; smaller substitutes or Git LFS may be more appropriate.

The project is currently focused on the core viewer, scene authoring API, examples, and documentation. See the roadmap and decision records for current priorities and architectural context.

# Contributing to newHOP

## Audience Levels

newHOP is middleware used by third parties to build interactive 3D visualization webpages. In project discussions and documentation:

- **Developer** means the person building the newHOP library and distributable bundles.
- **Author** means the person using the distributed library to build a visualization application.
- **User** means a person accessing and interacting with that application.

Use the relevant level when describing a requirement or validating a change. For example, TypeScript API shape is primarily an author concern, bundle generation is a developer concern, and pointer behavior or visible feedback is a user concern.

## Requirements

- Node.js with npm
- A browser with WebGL support
- VS Code is recommended for the included tasks

Install dependencies from `newHOP/`:

```text
npm install
```

## Verification

Run these from `newHOP/`:

```text
npm run typecheck
npm run build
npm run build:distribution
```

The build performs TypeScript checking and creates ESM and global bundles in
`dist/`. `build:distribution` runs the build and creates the generated,
ignored authoring package in `distribution/`.

## Updating the Version

The version logged by each `Presenter` comes from the `version` field in `package.json`. Use a valid npm/SemVer version with three numeric components, such as `2026.0.2`. To update the version and keep `package-lock.json` in sync, run:

```text
npm version 2026.0.2 --no-git-tag-version
npm run build
```

Replace `2026.0.2` with the intended version. The first command updates the package and lockfile without creating a Git tag; the build injects the new value into the generated bundles. Create a Git tag or GitHub Release separately if needed.

When the workspace root is `newHOP`, use the configured tasks:

- `newHOP: Typecheck`
- `newHOP: Build`
- `newHOP: Build distribution`
- `newHOP: Start dev server`

The dev task runs Vite from the workspace root at `http://127.0.0.1:5173/`. If port 5173 is already occupied, Vite may choose the next available port; use the URL reported in the task output.

## Development Pages

Useful URLs while the dev server is running:

- `http://127.0.0.1:5173/`
- `http://127.0.0.1:5173/examples/basic.html`
- `http://127.0.0.1:5173/examples/advanced.html`
- `http://127.0.0.1:5173/examples/animation.html`
- `http://127.0.0.1:5173/examples/splats.html`
- `http://127.0.0.1:5173/examples/transforms.html`
- `http://127.0.0.1:5173/examples/z-up.html`
- `http://127.0.0.1:5173/examples/lighting.html`
- `http://127.0.0.1:5173/docs/authoring/illumination.html`
- `http://127.0.0.1:5173/docs/authoring/index.html`

The advanced example is the main integration surface for multiple models, transforms, tools, clipping, picking, measurement, and navigation.
The splat example uses `examples/large_assets/well_splat.ply`, which is intentionally a large development asset and should be replaced with a smaller sample or kept out of a lightweight source distribution.

## Directory Rules

- `src/`: TypeScript library source.
- `examples/`: development and feature-validation pages. Every example loads the generated `dist/newhop.global.js` bundle.
- `docs/authoring/`: author-facing HTML reference pages suitable for the distribution.
- `docs/development/`: architecture, contribution, roadmap, desiderata, and decision records for developers.
- `dist/`: generated bundle output.
- `workbench/`: ignored local project pages, experiments, and large or project-specific assets; this is not the automated test suite.
- `tests/`: reserved for committed, reproducible automated and feature-specific validation.
- `scripts/`: build helpers.

Do not edit generated bundles by hand.

## Change Workflow

1. Identify the owning manager or abstraction.
2. Update types and implementation together.
3. Update an example when behavior is user-facing.
4. Update the relevant HTML reference page and contributor notes.
5. Run typecheck and build.
6. Check the minimal and advanced pages when the change affects loading, rendering, or interaction.

Keep public APIs and scene-block names consistent. Runtime mutators on `Trackball` should accept the same structure as their corresponding scene block whenever possible.

## Documentation Rules

HTML pages document authoring and public usage. Markdown pages document project architecture, collaboration, workflows, and decisions. When a design choice changes, update the relevant decision record and architecture notes. Use the [release checklist](release.md) when preparing a library or authoring-distribution release.

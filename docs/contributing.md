# Contributing to newHOP

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
```

The build performs TypeScript checking, creates ESM and global bundles, and refreshes `minimal/lib/`.

When the workspace root is `newHOP`, use the configured tasks:

- `newHOP: Typecheck`
- `newHOP: Build`
- `newHOP: Start dev server`

The dev task runs Vite from the workspace root at `http://127.0.0.1:5173/`. If port 5173 is already occupied, Vite may choose the next available port; use the URL reported in the task output.

## Development Pages

Useful URLs while the dev server is running:

- `http://127.0.0.1:5173/`
- `http://127.0.0.1:5173/examples/minimal.html`
- `http://127.0.0.1:5173/examples/advanced.html`
- `http://127.0.0.1:5173/examples/animation.html`
- `http://127.0.0.1:5173/examples/splats.html`
- `http://127.0.0.1:5173/examples/transforms.html`
- `http://127.0.0.1:5173/examples/z-up.html`
- `http://127.0.0.1:5173/examples/lighting.html`
- `http://127.0.0.1:5173/docs/illumination.html`
- `http://127.0.0.1:5173/docs/index.html`

The advanced example is the main integration surface for multiple models, transforms, tools, clipping, picking, measurement, and navigation.
The splat example uses `examples/large_assets/well_splat.ply`, which is intentionally a large development asset and should be replaced with a smaller sample or kept out of a lightweight source distribution.

## Directory Rules

- `src/`: TypeScript library source.
- `examples/`: development and feature-validation pages.
- `docs/`: published HTML reference pages and contributor Markdown.
- `minimal/`: clean publishable example. Its `index.html` and `models/` are manually maintained; the build refreshes `minimal/lib/newhop.global.js` and `minimal/lib/corto.em.js`, which must stay beside each other.
- `dist/`: generated bundle output.
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

HTML pages document authoring and public usage. Markdown pages document project architecture, collaboration, workflows, and decisions. When a design choice changes, update the relevant decision record and architecture notes.

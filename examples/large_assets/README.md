# Large Example Assets

This directory is for large local assets used by the examples. Its contents are ignored by Git so large model files do not become part of ordinary commits.

Place the required files here when running the related examples locally:

- `well_splat.ply` for `examples/splats.html`
- `cloaca.nxz` and `sempronia.nxz` for `examples/z-up.html`

The examples expect these files under `examples/large_assets/`. Smaller substitutes may be used as long as the example paths are updated accordingly. Do not commit the model files in this directory unless they are intentionally added through a suitable large-file strategy such as Git LFS.

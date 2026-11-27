# newHOP Release Checklist

This checklist is for developers releasing the library and generating the
author-facing distribution. It is not author documentation.

## 1. Prepare the release

- Confirm the intended version follows the calendar versioning rule in
  [Decision 0024](decisions/0024-calendar-versioning.md).
- Check that the version is strictly greater than the previous released
  version.
- Update `package.json` and `package-lock.json` together:

  ```text
  npm version YYYY.M.D --no-git-tag-version
  ```

- Review the public API and intentional breaking changes.
- Confirm the author-facing README and documentation are current.
- Confirm `examples/` contains only curated examples and redistributable
  assets.
- Keep local experiments and project-specific material in ignored
  `workbench/`.

## 2. Run validation

From the repository root:

```text
npm install
npm run typecheck
npm run build
npm run build:distribution
```

The distribution build recreates the ignored `distribution/` directory,
copies the built library, examples, authoring documentation, and MIT license,
and validates required files and local HTML links.

Inspect the generated package manually:

- Open `distribution/index.html`.
- Open representative examples from `distribution/examples/`.
- Check that `distribution/dist/corto.em.js` is beside the built libraries.
- Check `distribution/version.json`.
- Confirm developer-only files are absent.
- Test the package from a served directory rather than from `file://`.

## 3. Review the release contents

- Review the generated distribution size.
- Check model, texture, worker, and WASM assets.
- Confirm third-party licenses and asset redistribution rights.
- Confirm no secrets, logs, local paths, or workbench content are included.
- Review the generated bundles for the expected version.
- Check the release notes and document user-visible changes.

## 4. Commit and manually publish

- Commit source, documentation, examples, and package metadata.
- Do not commit generated `dist/` or `distribution/` output unless a future
  release policy explicitly changes this rule.
- Push the final commit to GitHub.
- Open the **Release** workflow in GitHub Actions.
- Select the branch or commit containing the release.
- Choose **Run workflow**.

The manually triggered workflow validates the package version, builds both
packages, creates the version tag, creates the GitHub Release, and uploads:

```text
newhop-developer-YYYY.M.D.zip
newhop-authoring-YYYY.M.D.zip
```

The workflow does not run for ordinary commits or tags.

## 5. Verify the published result

- Download the released distribution into a clean directory.
- Serve it over HTTP.
- Open the distribution landing page and representative examples.
- Verify the version shown in `version.json` and by the built library.
- Confirm Nexus models can locate `corto.em.js`.
- Record any release-specific follow-up work in the developer roadmap.

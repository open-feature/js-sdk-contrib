# Module SBOM

Builds a [CycloneDX](https://cyclonedx.org/) Software Bill of Materials for one published package in this monorepo.

The repository is not an npm workspace. Its root lockfile contains every module, so `npm sbom` at the repository root describes the whole repo. Release automation runs this tool once per released package. The tool resolves an isolated manifest of that package's `dependencies` and `optionalDependencies`, then writes a CycloneDX SBOM. Dev dependencies and peer dependencies are left out of the tree.

## Generate an SBOM

From the repository root, with Node.js and npm available:

```sh
node tools/sbom/generate-module-sbom.js libs/hooks/debounce bom.json
```

`bom.json` is the CycloneDX document for `@openfeature/debounce-hook` and its runtime dependency tree.

## Test

```sh
npx nx test module-sbom
npx nx lint module-sbom
```

The fixture suite is offline. The debounce-hook case resolves `tslib` from the npm registry.

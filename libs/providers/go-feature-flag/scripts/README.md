# Scripts

This directory contains utility scripts for the go-feature-flag provider.

## copy-latest-wasm.js

This script copies the go-feature-flag WASM evaluation module from the `wasm-releases` submodule.

### Purpose

Previously, the WASM filename was hardcoded with a specific version (e.g., `gofeatureflag-evaluation_v1.45.6.wasm`), which made updates cumbersome and error-prone. This script replaces that approach with a configurable solution that:

1. Uses an explicit version constant (`TARGET_WASM_VERSION`) for controlled updates
2. Updates the git submodule to get the latest WASM releases
3. Validates that the requested version exists before copying
4. Copies the WASM file to the expected location

### Configuration

The script has one configuration constant at the top:

- `TARGET_WASM_VERSION`: The explicit WASM module version to use (e.g., `'0.2.4'`)

This is the WASM module version, which is versioned independently of the relay proxy — it
selects `wasm-releases/evaluation/gofeatureflag-evaluation_<version>.wasm`.

### Upgrading the WASM module

Changing `TARGET_WASM_VERSION` is only half of an upgrade. The script runs
`git submodule update --init wasm-releases` **without** `--remote`, so the submodule is reset
to the commit recorded in the superproject — a newer version will not be found there, and the
script exits `1`. Both steps are required:

```bash
# 1. advance the submodule to a commit that publishes the target version
git -C wasm-releases fetch origin
git -C wasm-releases checkout <commit>
git add wasm-releases

# 2. set TARGET_WASM_VERSION in copy-latest-wasm.js, then verify
npx nx copy-wasm providers-go-feature-flag
```

### Usage

The script is automatically executed by the `copy-wasm` target in `project.json` and is used as a dependency for the `test` and `package` targets.

You can also run it manually:

```bash
node scripts/copy-latest-wasm.js
```

### Benefits

- **Explicit control**: You can specify exactly which version to use
- **Easy updates**: Simply change the `TARGET_WASM_VERSION` constant when you want to upgrade
- **Error prevention**: Validates that the requested version exists before copying
- **Maintainability**: Reduces manual maintenance overhead while providing control
- **Consistency**: Ensures reproducible builds with known versions
- **Simplicity**: Clear and straightforward approach without complex logic

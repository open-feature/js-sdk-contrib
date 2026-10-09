import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Where the conformance assets live inside a checkout of open-feature/spec. */
const SPEC_ASSET_ROOT = join('spec', 'specification', 'assets', 'provider-tck');

/**
 * The directory each packaged asset directory is built from inside the spec submodule.
 *
 * Only `features` is renamed: the spec calls that directory `gherkin`, and the published package
 * keeps the name the API talks about.
 */
const SPEC_SUBDIR: Record<string, string> = {
  features: 'gherkin',
  flags: 'flags',
  openapi: 'openapi',
};

/**
 * Locates a directory of conformance assets, resolved from this module rather than from the working
 * directory.
 *
 * A workspace-relative path would resolve against whatever directory the test runner started in,
 * which is the workspace root here and something else entirely for a consumer of the published
 * package. Two layouts have to work, so both are tried in order:
 *
 *   - `<pkg>/features` — the published package, whose rollup `assets` globs copy the files next to
 *     the bundle, so **adopting the TCK never requires a git submodule**;
 *   - `<lib>/spec/specification/assets/provider-tck/gherkin` — this repository, reading straight out
 *     of the `open-feature/spec` submodule, where the assets are owned.
 *
 * Apart from the harness because {@link canonicalFlagSet} resolves the same directory the same way,
 * and a shared module keeps that from becoming an import cycle.
 */
export function resolveAssetDir(name: string): string {
  const fromSpec = join(SPEC_ASSET_ROOT, SPEC_SUBDIR[name] ?? name);
  const candidates = [
    // The published package, whose entry point sits at the package root or one level below it.
    join(__dirname, name),
    join(__dirname, '..', name),
    join(__dirname, '..', '..', name),
    // This repository, where the entry point compiles from `src/lib` under the library root.
    join(__dirname, '..', '..', fromSpec),
    join(__dirname, '..', fromSpec),
  ];

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(
      `tck: could not locate its '${name}' directory. ` +
        `Looked in: ${candidates.join(', ')}. ` +
        `Consuming the published package needs no submodule -- the assets ship inside it, so if ` +
        `they are missing it was built without its asset globs. Working in js-sdk-contrib needs ` +
        `the spec submodule: run 'git submodule update --init libs/shared/tck/spec'.`,
    );
  }
  return found;
}

/**
 * The canonical flag set, as raw JSON, for a suite that seeds a backend from it.
 *
 * One definition of the path: the file is both what an adopter seeds a backend from and what this
 * library builds its in-memory configuration out of.
 */
export const CANONICAL_FLAGS_PATH = join(resolveAssetDir('flags'), 'canonical-flags.json');

/** The OpenAPI document a containerised backend under test must implement. */
export const CONTROL_API_PATH = join(resolveAssetDir('openapi'), 'control-api.yaml');

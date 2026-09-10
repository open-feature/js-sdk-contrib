import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, parse } from 'node:path';

/** This library's package name, which is what identifies its manifest while walking up to it. */
export const TCK_PACKAGE = '@openfeature/provider-tck';

/**
 * Resolves modules from this file's location rather than from the working directory.
 *
 * The suffix is arbitrary: `createRequire` wants a file path, not a directory.
 */
const requireFrom = createRequire(join(__dirname, 'resolve-from-here.js'));

/**
 * The installed version of a package, read at run time rather than declared.
 *
 * Declared is a second place to be wrong: a report would keep claiming 1.17.0 after a dependency
 * bump moved the actual code underneath it. `@openfeature/server-sdk` publishes no `./package.json`
 * export, so the manifest is found by walking up from the resolved entry point.
 */
export function packageVersion(packageName: string): string {
  try {
    return manifestVersion(dirname(requireFrom.resolve(packageName)), packageName);
  } catch {
    return 'unknown';
  }
}

/** This library's own version, found by walking up from its compiled or bundled location. */
export function ownVersion(): string {
  return manifestVersion(__dirname, TCK_PACKAGE);
}

function manifestVersion(startDir: string, packageName: string): string {
  let dir = startDir;

  for (;;) {
    try {
      const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
        name?: string;
        version?: string;
      };
      if (manifest.name === packageName && manifest.version) {
        return manifest.version;
      }
    } catch {
      // No manifest here, or one that cannot be read. Keep walking.
    }

    const parent = dirname(dir);
    if (parent === dir || dir === parse(dir).root) {
      return 'unknown';
    }
    dir = parent;
  }
}

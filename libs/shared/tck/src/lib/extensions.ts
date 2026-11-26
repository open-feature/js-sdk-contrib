import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** One extension feature file, resolved and checked. */
export interface ExtensionFeatureFile {
  /** The bare file name without extension, which is what names the feature a scenario belongs to. */
  feature: string;
  /** The absolute path it was found at. */
  path: string;
}

/**
 * Every `.feature` file in a directory *tree*, as a path under `dir`, in a stable order.
 *
 * Recursive, because a scan of direct children under-collects silently: an adopter who groups
 * features into subdirectories gets a run missing scenarios and no word about it.
 *
 * Ordered by entry name at each level, depth first, rather than by whole path, so the order does not
 * depend on the platform's separator: `dir/x.feature` sorts before `dir.feature` under `/` and after
 * it under `\`, which would make Jest's test order differ between a machine and CI.
 *
 * Symlinks are followed, a silently skipped symlinked directory being the thing this recursion
 * exists to stop. `visited` holds the real path of every directory already walked, which stops a
 * link pointing at an ancestor from recursing forever.
 */
export function featureFiles(dir: string): string[] {
  const found: string[] = [];
  collect(dir, found, new Set());
  return found;
}

function collect(dir: string, into: string[], visited: Set<string>): void {
  const real = realpathSync(dir);
  if (visited.has(real)) {
    return;
  }
  visited.add(real);

  // `statSync` rather than `readdirSync`'s own dirents, so a symlinked subdirectory is walked
  // rather than passed over as "not a directory".
  for (const entry of readdirSync(dir).sort()) {
    const child = join(dir, entry);
    if (statSync(child).isDirectory()) {
      collect(child, into, visited);
    } else if (extname(entry) === '.feature') {
      into.push(child);
    }
  }
}

/** Whether `child` is `parent` or sits underneath it, on any platform's separator and casing. */
function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!isAbsolute(rel) && !rel.split(sep).includes('..'));
}

/**
 * Resolves the feature files an adopter contributed, and refuses any that could displace a canonical
 * one.
 *
 * Each path is either a directory -- every `.feature` file anywhere under it, in the stable order
 * {@link featureFiles} defines -- or a single `.feature` file.
 *
 * The refusals are the point of this function: an extension that displaces a canonical feature leaves
 * a green run that did not ask the questions it claims to have asked. Three rules make that
 * unrepresentable:
 *
 *   - an extension file may not live inside the canonical asset directory, which would run a
 *     canonical feature a second time and record two outcomes for one scenario;
 *   - an extension file may not be named after a canonical one, that name being what identifies the
 *     feature a scenario belongs to;
 *   - two extension files may not share a name either. The name is the bare file name, so this holds
 *     across subdirectories and the recursion above does not reintroduce the shadowing it makes
 *     newly reachable.
 */
export function resolveExtensionFeatures(
  paths: readonly string[],
  canonicalDir: string,
  canonicalNames: ReadonlySet<string>,
): ExtensionFeatureFile[] {
  const canonicalRoot = resolve(canonicalDir);
  const claimed = new Map<string, string>();
  const resolved: ExtensionFeatureFile[] = [];

  for (const raw of paths) {
    const path = resolve(raw);

    if (!existsSync(path)) {
      throw new Error(
        `tck: extensionFeatures names ${path}, which does not exist. It is resolved against ` +
          `the working directory, so pass an absolute path -- join(__dirname, 'features') rather ` +
          `than a workspace-relative one, which resolves differently depending on where the runner ` +
          `was started.`,
      );
    }

    const directory = statSync(path).isDirectory();

    if (!directory && extname(path) !== '.feature') {
      throw new Error(`tck: extensionFeatures names ${path}, which is neither a directory nor a .feature file.`);
    }

    const files = directory ? featureFiles(path) : [path];

    if (!files.length) {
      throw new Error(
        `tck: extensionFeatures names the directory ${path}, which contains no .feature files -- ` +
          `and neither does any directory under it, since the scan is recursive.`,
      );
    }

    for (const file of files) {
      if (isInside(canonicalRoot, file)) {
        throw new Error(
          `tck: extensionFeatures names ${file}, which is inside the canonical asset directory ` +
            `${canonicalRoot}. The canonical features are always loaded; naming them again would run ` +
            `them twice and record two outcomes for one scenario.`,
        );
      }

      const feature = basename(file, '.feature');

      if (canonicalNames.has(feature)) {
        throw new Error(
          `tck: the extension feature ${file} is named ${feature}.feature, which is the ` +
            `name of a canonical feature. This name identifies the feature a scenario came from, ` +
            `so the two would be indistinguishable and an adopter's scenario would be read as a ` +
            `canonical one. Rename it, and keep extension features in a directory of their own -- ` +
            `never one named after the canonical directory.`,
        );
      }

      const already = claimed.get(feature);
      if (already) {
        throw new Error(
          `tck: two extension features are named ${feature}.feature -- ${already} and ` +
            `${file}. This name identifies a scenario's feature, so it has to be unique.`,
        );
      }

      claimed.set(feature, file);
      resolved.push({ feature, path: file });
    }
  }

  return resolved;
}

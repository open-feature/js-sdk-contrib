import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/**
 * The URI prefix an extension feature is named under in the results stream.
 *
 * A canonical feature is named by the path it has in open-feature/spec, which -- with
 * `tck.specRevision` from the envelope -- says exactly which artifact ran. An adopter's feature has
 * no such path, and giving it one would claim the canonical suite contains something it does not.
 * So extension features are named under their own prefix, and that is what tells a report consumer
 * which scenarios came from the shared suite and which the adopter added.
 *
 * The bare file name is enough after the prefix, because two extension features may not share one.
 */
export const EXTENSION_URI_PREFIX = 'extensions';

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
 * Recursive, and that is the whole point of it being a function rather than a `readdirSync` filter.
 * A scan of direct children only under-collects silently: an adopter who groups their features into
 * subdirectories — the obvious thing to do once there are more than a handful — gets a run that is
 * missing scenarios and says nothing about it. Silent under-collection is the same failure the
 * shadowing refusals below exist to prevent, arrived at from the other direction: there, a scenario
 * ran and was attributed to the wrong feature; here, it never ran and nothing was attributed at all.
 * Both leave a green run that did not ask the questions it claims to have asked.
 *
 * Ordering is by entry name at each level, depth first, so it does not depend on the order the
 * filesystem happens to return entries in *or* on the platform's path separator. Sorting whole paths
 * would do the latter: `dir/x.feature` sorts before `dir.feature` under `/` and after it under `\`,
 * which would make Jest's test order differ between a contributor's machine and CI.
 *
 * Symlinks are followed, because a symlinked feature directory that was silently skipped is the very
 * thing this function is being recursive about. `visited` holds the real path of every directory
 * already walked, which is what stops a link pointing at an ancestor from recursing forever.
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
 * The refusals are the point of this function, and they exist because the Java TCK shipped without
 * them: a same-named feature file in a second location *replaced* the canonical one there, and the
 * suite went green having run the adopter's version of a canonical scenario instead of the canonical
 * one. Nothing about that is visible in a passing run, which is the worst way for a conformance suite
 * to be wrong. Three rules make it unrepresentable here:
 *
 *   - an extension file may not live inside the canonical asset directory, which would run a
 *     canonical feature a second time and record two outcomes for one scenario;
 *   - an extension file may not be named after a canonical one. This name is what identifies the
 *     feature a scenario belongs to, so two features called `errors` would attribute an adopter's
 *     scenario to the canonical suite;
 *   - two extension files may not share a name either, for the same reason. The name is the bare
 *     file name, so this holds across subdirectories: `targeting/fractional.feature` and
 *     `caching/fractional.feature` are both `fractional` and are refused, which is why the recursion
 *     does not reintroduce the shadowing it makes newly reachable.
 *
 * The canonical features are loaded unconditionally and separately, so an extension cannot prevent
 * one from loading; these rules close the remaining gap, which is an extension being mistaken for
 * one.
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

import { existsSync, readdirSync, statSync } from 'node:fs';
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
  /** The bare file name without extension, which is what the report records the scenario under. */
  feature: string;
  /** The absolute path it was found at. */
  path: string;
}

/** Every `.feature` file directly in a directory, in a stable order. */
export function featureFileNames(dir: string): string[] {
  return readdirSync(dir)
    .filter((entry) => extname(entry) === '.feature')
    .sort();
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
 * Each path is either a directory -- every `.feature` file directly in it, sorted -- or a single
 * `.feature` file.
 *
 * The refusals are the point of this function, and they exist because the Java TCK shipped without
 * them: a same-named feature file in a second location *replaced* the canonical one there, and the
 * suite went green having run the adopter's version of a canonical scenario instead of the canonical
 * one. Nothing about that is visible in a passing run, which is the worst way for a conformance suite
 * to be wrong. Three rules make it unrepresentable here:
 *
 *   - an extension file may not live inside the canonical asset directory, which would run a
 *     canonical feature a second time and be reported as a duplicate outcome;
 *   - an extension file may not be named after a canonical one. Names are how the report records the
 *     feature a scenario belongs to, so two features called `errors` would attribute an adopter's
 *     scenario to the canonical suite;
 *   - two extension files may not share a name either, for the same reason.
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
        `provider-tck: extensionFeatures names ${path}, which does not exist. It is resolved against ` +
          `the working directory, so pass an absolute path -- join(__dirname, 'features') rather ` +
          `than a workspace-relative one, which resolves differently depending on where the runner ` +
          `was started.`,
      );
    }

    const directory = statSync(path).isDirectory();

    if (!directory && extname(path) !== '.feature') {
      throw new Error(
        `provider-tck: extensionFeatures names ${path}, which is neither a directory nor a .feature file.`,
      );
    }

    const files = directory ? featureFileNames(path).map((entry) => join(path, entry)) : [path];

    if (!files.length) {
      throw new Error(`provider-tck: extensionFeatures names the directory ${path}, which contains no .feature files.`);
    }

    for (const file of files) {
      if (isInside(canonicalRoot, file)) {
        throw new Error(
          `provider-tck: extensionFeatures names ${file}, which is inside the canonical asset directory ` +
            `${canonicalRoot}. The canonical features are always loaded; naming them again would run ` +
            `them twice and record two outcomes for one scenario.`,
        );
      }

      const feature = basename(file, '.feature');

      if (canonicalNames.has(feature)) {
        throw new Error(
          `provider-tck: the extension feature ${file} is named ${feature}.feature, which is the ` +
            `name of a canonical feature. The report records the feature a scenario came from by ` +
            `this name, so the two would be indistinguishable and an adopter's scenario would be ` +
            `read as a canonical one. Rename it, and keep extension features in a directory of ` +
            `their own -- never one named after the canonical directory.`,
        );
      }

      const already = claimed.get(feature);
      if (already) {
        throw new Error(
          `provider-tck: two extension features are named ${feature}.feature -- ${already} and ` +
            `${file}. The report records a scenario's feature by this name, so it has to be unique.`,
        );
      }

      claimed.set(feature, file);
      resolved.push({ feature, path: file });
    }
  }

  return resolved;
}

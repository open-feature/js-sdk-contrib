import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { featureFiles, resolveExtensionFeatures } from './extensions';
import { loadExtensionFeatures, loadTckFeatures } from './runProviderTck';

/** The canonical feature names, read the same way the harness reads them. */
const canonicalNames = new Set(loadTckFeatures(undefined).map(({ feature }) => feature));

/** Stands in for the canonical asset directory, so a test can put a file "inside" it. */
let canonicalDir: string;
let workspace: string;

const FEATURE = ['Feature: Vendor', '', '  Scenario: A vendor scenario', '    Given a stable provider', ''].join('\n');

const write = (dir: string, name: string): string => {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, FEATURE, 'utf8');
  return path;
};

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'tck-extensions-'));
  canonicalDir = join(workspace, 'gherkin');
  for (const name of canonicalNames) {
    write(canonicalDir, `${name}.feature`);
  }
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe('resolving extension features', () => {
  it('takes every .feature file in a directory, in a stable order', () => {
    const dir = join(workspace, 'extension-features');
    write(dir, 'zebra.feature');
    write(dir, 'alpha.feature');
    write(dir, 'notes.md');

    expect(resolveExtensionFeatures([dir], canonicalDir, canonicalNames).map(({ feature }) => feature)).toEqual([
      'alpha',
      'zebra',
    ]);
  });

  it('recurses into subdirectories rather than under-collecting in silence', () => {
    // A scan of direct children only leaves an adopter who grouped features into subdirectories
    // with a run missing scenarios and no word about it.
    const dir = join(workspace, 'extension-features');
    write(dir, 'alpha.feature');
    write(dir, 'zebra.feature');
    write(join(dir, 'nested'), 'deep.feature');
    write(join(dir, 'nested', 'deeper'), 'deepest.feature');
    write(join(dir, 'nested'), 'notes.md');

    // Depth first, by entry name at each level, so 'nested' sorts between the two files. Not by
    // whole path, which depends on the platform's separator sorting before or after '.'.
    expect(resolveExtensionFeatures([dir], canonicalDir, canonicalNames).map(({ feature }) => feature)).toEqual([
      'alpha',
      'deep',
      'deepest',
      'zebra',
    ]);
  });

  it('keeps the shadowing refusals in force across subdirectories', () => {
    // Recursion makes two new shadowing opportunities reachable -- a canonical name buried a level
    // down, and one bare name claimed twice -- and the bare file name does not get qualified by its
    // subdirectory, so the same rules refuse both.
    const [canonical] = [...canonicalNames].sort();
    const dir = join(workspace, 'extension-features');
    write(join(dir, 'nested'), `${canonical}.feature`);

    expect(() => resolveExtensionFeatures([dir], canonicalDir, canonicalNames)).toThrow(
      `is named ${canonical}.feature, which is the name of a canonical feature`,
    );

    const twice = join(workspace, 'twice');
    write(join(twice, 'targeting'), 'fractional.feature');
    write(join(twice, 'caching'), 'fractional.feature');

    expect(() => resolveExtensionFeatures([twice], canonicalDir, canonicalNames)).toThrow(
      'two extension features are named fractional.feature',
    );
  });

  it('takes a single .feature file as well as a directory', () => {
    const file = write(join(workspace, 'extension-features'), 'alpha.feature');
    const other = write(join(workspace, 'more-features'), 'beta.feature');

    expect(resolveExtensionFeatures([file, other], canonicalDir, canonicalNames).map(({ path }) => path)).toEqual([
      file,
      other,
    ]);
  });

  it('refuses an extension feature named after a canonical one', () => {
    // A same-named file in a second location would replace the canonical one and leave the suite
    // green on the adopter's version of a canonical scenario. The name is refused instead.
    const [canonical] = [...canonicalNames].sort();
    const shadow = write(join(workspace, 'extension-features'), `${canonical}.feature`);

    expect(() => resolveExtensionFeatures([shadow], canonicalDir, canonicalNames)).toThrow(
      `is named ${canonical}.feature, which is the name of a canonical feature`,
    );
  });

  it('refuses an extension feature that lives inside the canonical asset directory', () => {
    // Naming the canonical directory would load it twice and record two outcomes for one scenario.
    const inside = write(join(canonicalDir, 'nested'), 'vendor.feature');

    expect(() => resolveExtensionFeatures([inside], canonicalDir, canonicalNames)).toThrow(
      'inside the canonical asset directory',
    );
    expect(() => resolveExtensionFeatures([canonicalDir], canonicalDir, canonicalNames)).toThrow(
      'inside the canonical asset directory',
    );
  });

  it('refuses two extension features that share a name', () => {
    const first = write(join(workspace, 'extension-features'), 'vendor.feature');
    write(join(workspace, 'more-features'), 'vendor.feature');

    expect(() =>
      resolveExtensionFeatures([first, join(workspace, 'more-features')], canonicalDir, canonicalNames),
    ).toThrow('two extension features are named vendor.feature');
  });

  it('refuses a path that does not exist, that is empty, or that is not a feature file', () => {
    expect(() => resolveExtensionFeatures([join(workspace, 'absent')], canonicalDir, canonicalNames)).toThrow(
      'which does not exist',
    );

    mkdirSync(join(workspace, 'empty'));
    expect(() => resolveExtensionFeatures([join(workspace, 'empty')], canonicalDir, canonicalNames)).toThrow(
      'contains no .feature files',
    );

    writeFileSync(join(workspace, 'notes.md'), 'not a feature', 'utf8');
    expect(() => resolveExtensionFeatures([join(workspace, 'notes.md')], canonicalDir, canonicalNames)).toThrow(
      'neither a directory nor a .feature file',
    );
  });
});

describe('loading extension features', () => {
  const fixtures = join(__dirname, '..', '..', 'fixtures', 'extension-features');

  it('loads nothing at all when no extension is configured', () => {
    expect(loadExtensionFeatures([], undefined)).toEqual([]);
  });

  it('marks an extension feature as not canonical, and names it by its file', () => {
    // The flag is how anything downstream tells an adopter's scenario from one the shared suite
    // owns.
    const [vendor] = loadExtensionFeatures([fixtures], undefined);

    expect(vendor.feature).toBe('vendor');
    expect(vendor.canonical).toBe(false);
    expect(vendor.parsed.scenarios.map(({ title }) => title)).toContain(
      'A vendor rule resolves through the provider under test',
    );
  });

  it('leaves every canonical feature canonical', () => {
    for (const feature of loadTckFeatures(undefined)) {
      expect(feature.canonical).toBe(true);
    }
  });

  it('reads the canonical directory the same way the loader does', () => {
    expect(featureFiles(join(workspace, 'gherkin'))).toEqual(
      [...canonicalNames].sort().map((name) => join(workspace, 'gherkin', `${name}.feature`)),
    );
  });

  it('follows a symlinked directory without recursing forever through a cycle', () => {
    // A symlinked feature directory skipped as "not a directory" is the under-collection this
    // recursion exists to stop, and following links needs the cycle guard below.
    const dir = join(workspace, 'linked');
    write(dir, 'alpha.feature');
    write(join(dir, 'real'), 'beta.feature');

    try {
      symlinkSync(join(dir, 'real'), join(dir, 'link'), 'dir');
      symlinkSync(dir, join(dir, 'real', 'loop'), 'dir');
    } catch (error) {
      // Windows refuses to create a symlink without Developer Mode or elevation.
      if ((error as NodeJS.ErrnoException).code === 'EPERM' || (error as NodeJS.ErrnoException).code === 'EEXIST') {
        return;
      }
      throw error;
    }

    // That it returns is the assertion the cycle guard is here for. 'beta' appears once because the
    // guard is keyed on the real path, so a directory reached under two names is walked once.
    expect(featureFiles(dir).map((path) => basename(path, '.feature'))).toEqual(['alpha', 'beta']);
  });
});

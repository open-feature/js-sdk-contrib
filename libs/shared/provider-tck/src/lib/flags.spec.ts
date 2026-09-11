import { readFileSync } from 'node:fs';
import { CANONICAL_FLAGS_PATH } from './assets';
import { CHANGING_BASELINE, CHANGING_CHANGED, CHANGING_FLAG_KEY, canonicalFlagSet } from './flags';

/**
 * The packaged canonical flag file, read here independently of the loader under test.
 *
 * The point of this file is that `canonicalFlagSet` is a *parse* of the specification's
 * `canonical-flags.json` rather than a transcription of it, so these tests read the same file and
 * check that what came back is what it says. A loader that dropped a flag, mixed up a default
 * variant, treated a `$comment` as a flag or mangled a value fails here.
 *
 * What that on its own cannot catch is the file itself changing, since both sides would move
 * together — so the second half of this file pins the handful of properties the file's own
 * `$comment` calls load-bearing. Those are not a second copy of the flag set; they are the
 * invariants the scenarios depend on, and the canonical Gherkin corpus asserts the same values
 * independently, which is what makes a drifted file fail the suite rather than pass it quietly.
 */
const packaged = JSON.parse(readFileSync(CANONICAL_FLAGS_PATH, 'utf8')) as {
  flags: Record<string, { state: string; defaultVariant: string; variants: Record<string, unknown> }>;
};

/** The flags the file defines, with the document-level annotation dropped. */
const packagedFlags = Object.entries(packaged.flags).filter(([key]) => key !== '$comment');

/** What a flag resolves to: the value its default variant names. */
function resolved(flag: { defaultVariant: string; variants: Record<string, unknown> }): unknown {
  return flag.variants[flag.defaultVariant];
}

describe('canonicalFlagSet is the packaged canonical-flags.json', () => {
  it('is not reading an empty or truncated file', () => {
    // Guards the rest of this file: every assertion below is driven by `packagedFlags`, so an empty
    // parse would make all of them pass while examining nothing.
    expect(packagedFlags.length).toBeGreaterThanOrEqual(13);
  });

  it('defines exactly the flags the file defines', () => {
    expect(Object.keys(canonicalFlagSet()).sort()).toEqual(packagedFlags.map(([key]) => key).sort());
  });

  it('resolves every flag to the value its packaged defaultVariant names', () => {
    const configuration = canonicalFlagSet();

    for (const [key, flag] of packagedFlags) {
      const configured = configuration[key];

      expect(configured).toBeDefined();
      expect(configured.defaultVariant).toBe(flag.defaultVariant);
      expect(configured.variants[configured.defaultVariant]).toEqual(resolved(flag));
    }
  });

  it('carries every variant of every flag, and no invented ones', () => {
    const configuration = canonicalFlagSet();

    for (const [key, flag] of packagedFlags) {
      const expected = Object.fromEntries(Object.entries(flag.variants).filter(([name]) => name !== '$comment'));

      expect(configuration[key].variants).toEqual(expected);
    }
  });

  it('translates ENABLED into a flag that is not disabled', () => {
    const configuration = canonicalFlagSet();

    for (const [key, flag] of packagedFlags) {
      expect(configuration[key].disabled).toBe(flag.state === 'DISABLED');
    }
  });

  it('treats a $comment as an annotation rather than as a flag or a variant', () => {
    // The file carries one at the document level and several inside flags, so this is not a
    // hypothetical shape.
    expect(Object.keys(canonicalFlagSet())).not.toContain('$comment');

    for (const flag of Object.values(canonicalFlagSet())) {
      expect(Object.keys(flag.variants)).not.toContain('$comment');
    }
  });

  it('returns a fresh configuration per call, so one scenario cannot mutate the next', () => {
    const first = canonicalFlagSet();
    const second = canonicalFlagSet();

    expect(first).not.toBe(second);
    expect(first['object-flag'].variants).not.toBe(second['object-flag'].variants);

    first['boolean-flag'].defaultVariant = 'off';
    expect(canonicalFlagSet()['boolean-flag'].defaultVariant).toBe('on');
  });
});

describe('the properties the canonical file calls load-bearing', () => {
  /*
   * These are the assertions that would fail if the packaged file changed underneath the suite,
   * which the equivalence tests above cannot see: they compare the loader against the file, so the
   * two move together. Each one is a property the file's own comment names, and each is also
   * asserted by a canonical scenario -- so a value that drifts here breaks the conformance run too,
   * rather than only this file.
   */

  it('omits missing-flag, which the FLAG_NOT_FOUND scenario depends on being absent', () => {
    expect(Object.keys(canonicalFlagSet())).not.toContain('missing-flag');
  });

  it('keeps the falsy values as values rather than absences', () => {
    const configuration = canonicalFlagSet();

    expect(resolved(configuration['boolean-zero-flag'])).toBe(false);
    expect(resolved(configuration['integer-zero-flag'])).toBe(0);
    expect(resolved(configuration['string-zero-flag'])).toBe('');
  });

  it('keeps large-integer-flag at 2^31 - 1 and huge-integer-flag at 2^53 - 1, unrounded', () => {
    const configuration = canonicalFlagSet();

    expect(resolved(configuration['large-integer-flag'])).toBe(2147483647);
    expect(resolved(configuration['huge-integer-flag'])).toBe(Number.MAX_SAFE_INTEGER);
    expect(resolved(configuration['huge-integer-flag'])).toBe(9007199254740991);
  });

  it('resolves the plain scalar flags to the values the scenarios expect', () => {
    const configuration = canonicalFlagSet();

    expect(resolved(configuration['boolean-flag'])).toBe(true);
    expect(resolved(configuration['string-flag'])).toBe('hi');
    expect(resolved(configuration['integer-flag'])).toBe(10);
    expect(resolved(configuration['float-flag'])).toBe(0.5);
    // 10.0 in the file. JavaScript has no integer type, so this is the same value as 10 -- which is
    // the language fact that makes @numeric-coercion unaskable here, not a loss in the parse.
    expect(resolved(configuration['integral-float-flag'])).toBe(10);
    // A string flag, asked for as a boolean by the TYPE_MISMATCH scenario.
    expect(resolved(configuration['wrong-flag'])).toBe('uno');
  });

  it('resolves object-flag to the structured template', () => {
    expect(resolved(canonicalFlagSet()['object-flag'])).toEqual({
      showImages: true,
      title: 'Check out these pics!',
      imagesPerPage: 100,
    });
  });

  it('gives no flag a contextEvaluator, so every evaluation reports STATIC', () => {
    for (const flag of Object.values(canonicalFlagSet())) {
      expect(flag.contextEvaluator).toBeUndefined();
    }
  });
});

describe('changing-flag', () => {
  it('has the two variants CHANGING_BASELINE and CHANGING_CHANGED name', () => {
    expect(Object.keys(canonicalFlagSet()[CHANGING_FLAG_KEY].variants).sort()).toEqual(
      [CHANGING_BASELINE, CHANGING_CHANGED].sort(),
    );
  });

  it('defaults to the baseline and follows the requested variant', () => {
    expect(canonicalFlagSet()[CHANGING_FLAG_KEY].defaultVariant).toBe(CHANGING_BASELINE);
    expect(canonicalFlagSet(CHANGING_CHANGED)[CHANGING_FLAG_KEY].defaultVariant).toBe(CHANGING_CHANGED);
  });

  it('changes nothing else when the variant is flipped', () => {
    const baseline = canonicalFlagSet(CHANGING_BASELINE);
    const changed = canonicalFlagSet(CHANGING_CHANGED);

    for (const key of Object.keys(baseline).filter((entry) => entry !== CHANGING_FLAG_KEY)) {
      expect(changed[key]).toEqual(baseline[key]);
    }
  });

  it('refuses a variant the flag does not have, rather than serving an unresolvable default', () => {
    expect(() => canonicalFlagSet('nonexistent')).toThrow(/not a variant of 'changing-flag'/);
  });
});

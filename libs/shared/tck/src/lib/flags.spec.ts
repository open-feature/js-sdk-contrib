import { readFileSync } from 'node:fs';
import { CANONICAL_FLAGS_PATH } from './assets';
import { CHANGING_BASELINE, CHANGING_CHANGED, CHANGING_FLAG_KEY, canonicalFlagSet } from './flags';

/**
 * The packaged canonical flag file, read here independently of the loader under test.
 *
 * `canonicalFlagSet` is a *parse* of the specification's `canonical-flags.json` rather than a
 * transcription, so these tests read the same file and check that what came back is what it says.
 *
 * What that cannot catch is the file itself changing, both sides moving together — so the second half
 * of this file pins the properties the file's own `$comment` calls load-bearing.
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
    // Guards the rest: every assertion below is driven by `packagedFlags`, so an empty parse would
    // make them all pass while examining nothing.
    expect(packagedFlags.length).toBeGreaterThanOrEqual(18);
  });

  it('defines exactly the flags the file defines', () => {
    expect(Object.keys(canonicalFlagSet()).sort()).toEqual(packagedFlags.map(([key]) => key).sort());
  });

  it('carries the value its packaged defaultVariant names for every flag, disabled ones included', () => {
    // "Carries", not "resolves": the `disabled-*` flags are included deliberately. What suppresses
    // their value is the flag's state, asserted separately below, and a decoder that dropped their
    // variants would make those scenarios pass for the wrong reason -- a flag resolving to nothing
    // and a flag with nothing to resolve look identical from the caller's side.
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
    // The file carries one at the document level and several inside flags.
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
   * The assertions that would fail if the packaged file changed underneath the suite, which the
   * equivalence tests above cannot see. Each is a property the file's own comment names.
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
    // 10.0 in the file, and the same value as 10 in JavaScript -- the language fact behind
    // @numeric-coercion being unaskable here, not a loss in the parse.
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

  it('disables exactly the four disabled-* flags and nothing else', () => {
    // Widest blast radius of the file's properties: every other canonical scenario assumes the flag
    // it names serves its own value, and enabling one of these four makes the @disabled-flags rows
    // pass while examining nothing. Asserted over the whole set, so a fifth disabled flag arriving
    // upstream shows up here rather than in whichever scenario it silently broke.
    const configuration = canonicalFlagSet();
    const disabled = Object.keys(configuration).filter((key) => configuration[key].disabled);

    expect(disabled.sort()).toEqual([
      'disabled-boolean-flag',
      'disabled-float-flag',
      'disabled-integer-flag',
      'disabled-string-flag',
    ]);
  });

  it('mirrors each disabled flag on its enabled twin, so the caller default differs from the value', () => {
    // What makes the @disabled-flags rows catch a provider that ignores the state: each row's caller
    // default is the flag's *other* variant. A disabled flag whose default variant drifted to match
    // the scenario's caller default would pass whether the state was honoured or not.
    const configuration = canonicalFlagSet();
    const mirrors: [string, string][] = [
      ['disabled-boolean-flag', 'boolean-flag'],
      ['disabled-string-flag', 'string-flag'],
      ['disabled-integer-flag', 'integer-flag'],
      ['disabled-float-flag', 'float-flag'],
    ];

    for (const [disabledKey, enabledKey] of mirrors) {
      expect(configuration[disabledKey].variants).toEqual(configuration[enabledKey].variants);
      expect(resolved(configuration[disabledKey])).toEqual(resolved(configuration[enabledKey]));
    }

    // And the scenarios' caller defaults are the other variant of each pair, which is the half a
    // reader cannot see from the flag file alone.
    expect(resolved(configuration['disabled-boolean-flag'])).not.toBe(false);
    expect(resolved(configuration['disabled-string-flag'])).not.toBe('bye');
    expect(resolved(configuration['disabled-integer-flag'])).not.toBe(1);
    expect(resolved(configuration['disabled-float-flag'])).not.toBe(0.1);
  });

  it('gives no flag a contextEvaluator, so every enabled flag reports STATIC', () => {
    // True of targeting-key-flag too, and not an oversight: the format expresses a rule as data and
    // InMemoryProvider as a `contextEvaluator` function, so the member is inert for this decoder and
    // the in-memory suites leave @targeting undeclared. "Enabled", because the disabled-* flags
    // resolve no variant and report whatever their provider reports for one it declined.
    for (const flag of Object.values(canonicalFlagSet())) {
      expect(flag.contextEvaluator).toBeUndefined();
    }
  });

  it('carries targeting-key-flag with its two variants, defaulting to the miss', () => {
    // The one flag with a targeting rule, and what makes context passthrough observable for a
    // backend that has targeting. The decoder reads state, variants and defaultVariant, so what
    // survives here is the shape the @targeting scenarios' default-variant halves assert.
    const flag = canonicalFlagSet()['targeting-key-flag'];

    expect(flag).toBeDefined();
    expect(Object.keys(flag.variants).sort()).toEqual(['hit', 'miss']);
    expect(flag.variants['hit']).toBe('hit');
    expect(flag.defaultVariant).toBe('miss');
    expect(resolved(flag)).toBe('miss');
  });

  it('drops the targeting member rather than passing it to the SDK as a flag field', () => {
    // The decoder translates three fields rather than passing the document through: a member it does
    // not understand must not ride along, where it could collide with a field the SDK adds later.
    const flag = canonicalFlagSet()['targeting-key-flag'] as Record<string, unknown>;

    expect(Object.keys(flag).sort()).toEqual(['defaultVariant', 'disabled', 'variants']);
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

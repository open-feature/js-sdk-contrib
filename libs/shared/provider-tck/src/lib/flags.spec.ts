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
    expect(packagedFlags.length).toBeGreaterThanOrEqual(18);
  });

  it('defines exactly the flags the file defines', () => {
    expect(Object.keys(canonicalFlagSet()).sort()).toEqual(packagedFlags.map(([key]) => key).sort());
  });

  it('carries the value its packaged defaultVariant names for every flag, disabled ones included', () => {
    // "Carries", not "resolves", and the distinction is the `disabled-*` flags. Their configured
    // value is the one value a conformant provider must never serve -- the caller's default stands
    // in instead -- so a reader could reasonably expect them to be exempt here. They are not, and
    // must not be: what suppresses the value is the flag's *state*, asserted separately below, and
    // the decoder has to carry the value through faithfully for the suppression to be observable at
    // all. A decoder that dropped their variants would make the scenarios pass for the wrong reason,
    // since a flag resolving to nothing and a flag with nothing to resolve look identical from the
    // caller's side.
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

  it('disables exactly the four disabled-* flags and nothing else', () => {
    // The newest of the file's load-bearing properties, and the one with the widest blast radius:
    // every other scenario in the canonical corpus assumes the flag it names serves its own value.
    // Disabling anything else turns those scenarios into failures that read as provider defects,
    // and enabling one of these four makes the @disabled-flags rows pass while examining nothing --
    // the flag would serve its configured value and the assertion is on the value.
    //
    // Asserted over the whole set rather than over the four names, so a fifth disabled flag arriving
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
    // What makes the @disabled-flags rows catch a provider that ignores the state: each row's
    // caller default is the flag's *other* variant, so a provider serving the configured value is
    // caught on the value alone, with no reason assertion needed. That only works while the twins
    // agree -- a disabled flag whose default variant drifted to match the scenario's caller default
    // would pass whether the state was honoured or not.
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
    // Still true of every flag, targeting-key-flag included, and it is not an oversight there. The
    // flag-definition format expresses a rule as data; InMemoryProvider expresses one as a
    // `contextEvaluator` function, and the format has no way to carry a function. So the flag's
    // `targeting` member is inert for this decoder, and the in-memory suites leave @targeting
    // undeclared rather than synthesise an evaluator to satisfy the scenarios -- which would test a
    // fixture written for the occasion instead of a provider.
    //
    // "Enabled", because the four disabled-* flags resolve no variant at all and so report whatever
    // their provider reports for a flag it declined to evaluate. The untagged scenarios that pin
    // STATIC name enabled flags only, and the @disabled-flags rows assert no reason.
    for (const flag of Object.values(canonicalFlagSet())) {
      expect(flag.contextEvaluator).toBeUndefined();
    }
  });

  it('carries targeting-key-flag with its two variants, defaulting to the miss', () => {
    // The one flag in the set with a targeting rule, and what makes context passthrough observable
    // for a backend that has targeting: a matching key resolves a different value, so a provider
    // that drops the context is caught by the resolved value rather than needing an echo endpoint.
    // The decoder reads state, variants and defaultVariant, so what survives here is the flag's
    // shape -- which is what the `@targeting` scenarios' default-variant halves assert.
    const flag = canonicalFlagSet()['targeting-key-flag'];

    expect(flag).toBeDefined();
    expect(Object.keys(flag.variants).sort()).toEqual(['hit', 'miss']);
    expect(flag.variants['hit']).toBe('hit');
    expect(flag.defaultVariant).toBe('miss');
    expect(resolved(flag)).toBe('miss');
  });

  it('drops the targeting member rather than passing it to the SDK as a flag field', () => {
    // The decoder is a translation of three fields, not a pass-through of the document. A member it
    // does not understand must not ride along into the SDK's configuration, where it would either be
    // ignored silently or -- worse -- collide with a field the SDK adds later.
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

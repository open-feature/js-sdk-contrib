import type { InMemoryProvider } from '@openfeature/server-sdk';

/**
 * The in-memory provider's flag configuration.
 *
 * Derived from the constructor rather than imported: `@openfeature/server-sdk` declares
 * `FlagConfiguration` in its type definitions but does not re-export it from the package entry
 * point, so importing it directly is a TS2459. Deriving it keeps this in lockstep with whatever the
 * SDK actually accepts.
 *
 * `NonNullable` is load-bearing: the constructor parameter is optional, so the bare
 * `ConstructorParameters<...>[0]` includes `undefined` and every use of the type inherits it.
 */
export type FlagConfiguration = NonNullable<ConstructorParameters<typeof InMemoryProvider>[0]>;

/** The flag {@link BackendControl.changeFlag} mutates. */
export const CHANGING_FLAG_KEY = 'changing-flag';

export const CHANGING_BASELINE = 'foo';
export const CHANGING_CHANGED = 'bar';

/**
 * The canonical flag set, as an in-memory provider configuration.
 *
 * Mirrors `flags/canonical-flags.json` entry for entry. Four properties of that file are
 * load-bearing and hold here too:
 *
 * - `missing-flag` is absent, which is what the `FLAG_NOT_FOUND` scenario tests. Adding it turns
 *   that scenario green for the wrong reason.
 * - no flag carries a `contextEvaluator`, so every evaluation reports reason `STATIC` — the TCK
 *   tests a provider's mapping of a response, not a backend's evaluation logic.
 * - `boolean-zero-flag`, `integer-zero-flag` and `string-zero-flag` resolve to `false`, `0` and `''`.
 *   They are values, not absences: a `value || default` anywhere on the way turns the falsy-value
 *   scenarios into failures that look like provider defects.
 * - `huge-integer-flag` is 2^53 − 1, which a JavaScript number holds exactly. It must not be
 *   rounded on the way in.
 *
 * Note that `integer-flag`, `float-flag` and `integral-float-flag` are all plain JavaScript numbers,
 * and `10.0` is the same value as `10`. The language has no integer type, which is why
 * {@link Capability.NumericCoercion} cannot be declared here; see that capability's documentation.
 */
export function canonicalFlagSet(changingVariant: string = CHANGING_BASELINE): FlagConfiguration {
  return {
    'boolean-flag': {
      variants: { on: true, off: false },
      defaultVariant: 'on',
      disabled: false,
    },
    'string-flag': {
      variants: { greeting: 'hi', parting: 'bye' },
      defaultVariant: 'greeting',
      disabled: false,
    },
    'integer-flag': {
      variants: { one: 1, ten: 10 },
      defaultVariant: 'ten',
      disabled: false,
    },
    'float-flag': {
      variants: { tenth: 0.1, half: 0.5 },
      defaultVariant: 'half',
      disabled: false,
    },
    // 2^31 - 1, the largest 32-bit signed integer. A float32 round trip does not preserve it.
    'large-integer-flag': {
      variants: { one: 1, 'max-int32': 2147483647 },
      defaultVariant: 'max-int32',
      disabled: false,
    },
    // 2^53 - 1, the largest integer JavaScript represents exactly. Only asked for under
    // @large-integers.
    'huge-integer-flag': {
      variants: { one: 1, 'max-safe': 9007199254740991 },
      defaultVariant: 'max-safe',
      disabled: false,
    },
    // A float with no fractional part, for the lossless half of @numeric-coercion.
    'integral-float-flag': {
      variants: { tenth: 0.1, ten: 10.0 },
      defaultVariant: 'ten',
      disabled: false,
    },
    // Resolves to false; the scenario's default is true, so treating false as missing is caught.
    'boolean-zero-flag': {
      variants: { zero: false, 'non-zero': true },
      defaultVariant: 'zero',
      disabled: false,
    },
    // Resolves to 0; the scenario's default is 1.
    'integer-zero-flag': {
      variants: { zero: 0, 'non-zero': 1 },
      defaultVariant: 'zero',
      disabled: false,
    },
    // Resolves to the empty string; the scenario's default is 'fallback'.
    'string-zero-flag': {
      variants: { zero: '', 'non-zero': 'str' },
      defaultVariant: 'zero',
      disabled: false,
    },
    'object-flag': {
      variants: {
        empty: {},
        template: {
          showImages: true,
          title: 'Check out these pics!',
          imagesPerPage: 100,
        },
      },
      defaultVariant: 'template',
      disabled: false,
    },
    // A string flag, evaluated as a boolean by the TYPE_MISMATCH scenario.
    'wrong-flag': {
      variants: { one: 'uno', two: 'dos' },
      defaultVariant: 'one',
      disabled: false,
    },
    [CHANGING_FLAG_KEY]: {
      variants: { [CHANGING_BASELINE]: CHANGING_BASELINE, [CHANGING_CHANGED]: CHANGING_CHANGED },
      defaultVariant: changingVariant,
      disabled: false,
    },
  };
}

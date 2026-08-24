import type { InMemoryProvider } from '@openfeature/server-sdk';

/**
 * The in-memory provider's flag configuration.
 *
 * Derived from the constructor rather than imported: `@openfeature/server-sdk` declares
 * `FlagConfiguration` in its type definitions but does not re-export it from the package entry
 * point, so importing it directly is a TS2459. Deriving it keeps this in lockstep with whatever the
 * SDK actually accepts.
 */
export type FlagConfiguration = ConstructorParameters<typeof InMemoryProvider>[0];

/** The flag {@link BackendControl.changeFlag} mutates. */
export const CHANGING_FLAG_KEY = 'changing-flag';

export const CHANGING_BASELINE = 'foo';
export const CHANGING_CHANGED = 'bar';

/**
 * The canonical flag set, as an in-memory provider configuration.
 *
 * Mirrors `flags/canonical-flags.json` entry for entry. Two properties of that file are
 * load-bearing and hold here too:
 *
 * - `missing-flag` is absent, which is what the `FLAG_NOT_FOUND` scenario tests. Adding it turns
 *   that scenario green for the wrong reason.
 * - no flag carries a `contextEvaluator`, so every evaluation reports reason `STATIC` — the TCK
 *   tests a provider's mapping of a response, not a backend's evaluation logic.
 *
 * Note that `integer-flag` and `float-flag` are both plain JavaScript numbers. The language has no
 * integer type, which is why {@link Capability.StrictNumericTyping} cannot be declared here; see
 * that capability's documentation.
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

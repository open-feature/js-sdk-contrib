import { readFileSync } from 'node:fs';
import type { InMemoryProvider } from '@openfeature/server-sdk';
import { CANONICAL_FLAGS_PATH } from './assets';

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

/** One entry of {@link FlagConfiguration}. */
type FlagDefinition = FlagConfiguration[string];

/** The flag {@link BackendControl.changeFlag} mutates. */
export const CHANGING_FLAG_KEY = 'changing-flag';

export const CHANGING_BASELINE = 'foo';
export const CHANGING_CHANGED = 'bar';

/**
 * The annotation key the flag-definition format uses for prose.
 *
 * It is a member of the document and of a flag rather than a flag or a variant, so it is dropped
 * wherever the format lets it appear. It is *not* stripped from inside a variant's value: a value
 * is opaque application data, and an object flag whose payload happened to have a `$comment` member
 * would be silently corrupted by a loader that reached into it.
 */
const COMMENT_KEY = '$comment';

/** `ENABLED`/`DISABLED` as the flag-definition format spells them. */
const ENABLED = 'ENABLED';
const DISABLED = 'DISABLED';

/** The shape of `canonical-flags.json`, before any of it is trusted. */
interface CanonicalFlagFile {
  flags?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A structural object of the format, with the annotation key dropped. */
function withoutComments(entries: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(entries).filter(([key]) => key !== COMMENT_KEY));
}

/**
 * Turns one entry of the canonical file into one entry of an in-memory flag configuration.
 *
 * Every failure here throws with the key in the message. The file is pinned by the spec submodule,
 * so a failure means the pinned assets and this loader disagree about the file's shape — which is
 * something moving the pin should surface loudly rather than something a run should limp past with
 * a partial flag set.
 */
function flagDefinition(key: string, raw: unknown): FlagDefinition {
  if (!isRecord(raw)) {
    throw new Error(`provider-tck: canonical flag '${key}' is not an object`);
  }

  const { state, variants, defaultVariant } = withoutComments(raw);

  if (state !== ENABLED && state !== DISABLED) {
    throw new Error(
      `provider-tck: canonical flag '${key}' has state ${JSON.stringify(state)}, which is neither ` +
        `'${ENABLED}' nor '${DISABLED}'`,
    );
  }
  if (!isRecord(variants)) {
    throw new Error(`provider-tck: canonical flag '${key}' has no variants object`);
  }
  if (typeof defaultVariant !== 'string') {
    throw new Error(`provider-tck: canonical flag '${key}' has no defaultVariant`);
  }

  const named = withoutComments(variants);
  if (!Object.prototype.hasOwnProperty.call(named, defaultVariant)) {
    throw new Error(
      `provider-tck: canonical flag '${key}' names default variant '${defaultVariant}', which is ` +
        `not one of its variants (${Object.keys(named).join(', ')})`,
    );
  }

  return {
    variants: named,
    defaultVariant,
    // The format states what a flag *is*; the SDK's configuration states what it is not. The
    // canonical set enables everything, so this is a translation rather than a decision.
    disabled: state === DISABLED,
  } as FlagDefinition;
}

/**
 * The canonical flag file's text, read once.
 *
 * Held as text rather than as a parsed object so that every call to {@link canonicalFlagSet} can
 * `JSON.parse` it afresh. The in-memory provider is handed the configuration directly and the
 * in-process control rebuilds it per scenario, so two callers sharing one object graph would let a
 * mutation in one scenario outlive it — the reference-sharing bug the Go implementation had to fix
 * in its in-memory provider.
 */
const canonicalFlagsText = readFileSync(CANONICAL_FLAGS_PATH, 'utf8');

/**
 * The canonical flag set, as an in-memory provider configuration.
 *
 * **Parsed out of `flags/canonical-flags.json`, not transcribed from it.** That file is the
 * language-agnostic definition of the flag set every implementation's suite runs against, and the
 * specification exposes it precisely so that an adopter can seed a backend from the definition
 * rather than copy it out by hand — transcription being the usual way the two drift apart. A
 * TypeScript literal here would be exactly that transcription, and the drift it invites is silent
 * in the worst way: the in-memory self-test would go green against a flag set that is no longer the
 * canonical one, so the suite would verify itself against the wrong baseline while reporting
 * success. Go's implementation, the reference, decodes the same file; this follows it.
 *
 * Four properties of that file are load-bearing, and survive the parse:
 *
 * - `missing-flag` is absent, which is what the `FLAG_NOT_FOUND` scenario tests. Adding it turns
 *   that scenario green for the wrong reason.
 * - no flag carries a `contextEvaluator`, so every evaluation reports reason `STATIC` — the TCK
 *   tests a provider's mapping of a response, not a backend's evaluation logic. Nothing here can
 *   introduce one: the format has no way to express it.
 * - `boolean-zero-flag`, `integer-zero-flag` and `string-zero-flag` resolve to `false`, `0` and `''`.
 *   They are values, not absences: a `value || default` anywhere on the way turns the falsy-value
 *   scenarios into failures that look like provider defects. `JSON.parse` preserves all three, and
 *   nothing downstream of it tests a variant value for truthiness.
 * - `huge-integer-flag` is 2^53 − 1, which a JavaScript number holds exactly, and which
 *   `JSON.parse` therefore reads without rounding.
 *
 * One thing the Go loader needs and this one does not: Go decodes with `UseNumber` so that `10` and
 * `10.0` stay an int64 and a float64, because `memprovider` type-asserts on them. JavaScript has no
 * integer type — `10.0` *is* `10` — so there is nothing to preserve and no decision to get wrong.
 * That is the same language fact that makes `@numeric-coercion` unaskable here.
 *
 * @param changingVariant which variant `changing-flag` resolves to. The in-process control flips it
 *   to produce a real configuration change; every other flag comes from the file untouched.
 */
export function canonicalFlagSet(changingVariant: string = CHANGING_BASELINE): FlagConfiguration {
  const file: CanonicalFlagFile = JSON.parse(canonicalFlagsText);

  if (!isRecord(file.flags)) {
    throw new Error(`provider-tck: ${CANONICAL_FLAGS_PATH} has no 'flags' object`);
  }

  const entries = Object.entries(withoutComments(file.flags));
  if (!entries.length) {
    throw new Error(`provider-tck: ${CANONICAL_FLAGS_PATH} defines no flags`);
  }

  const configuration: FlagConfiguration = {};
  for (const [key, raw] of entries) {
    configuration[key] = flagDefinition(key, raw);
  }

  // `changing-flag` is the one flag whose default variant the suite chooses rather than reads, so
  // it is the one flag whose variant *names* this module has to agree with the file about. Checked
  // rather than assumed: CHANGING_BASELINE and CHANGING_CHANGED are exported, the in-process
  // control switches between them, and a rename upstream would otherwise leave the control setting
  // a default variant the flag does not have — which the in-memory provider reports as a resolution
  // failure somewhere far away from the cause.
  const changing = configuration[CHANGING_FLAG_KEY];
  if (!changing) {
    throw new Error(
      `provider-tck: ${CANONICAL_FLAGS_PATH} defines no '${CHANGING_FLAG_KEY}', which is the flag ` +
        `the change-event scenarios mutate`,
    );
  }
  for (const variant of [CHANGING_BASELINE, CHANGING_CHANGED]) {
    if (!Object.prototype.hasOwnProperty.call(changing.variants, variant)) {
      throw new Error(
        `provider-tck: '${CHANGING_FLAG_KEY}' in ${CANONICAL_FLAGS_PATH} has no '${variant}' ` +
          `variant. CHANGING_BASELINE and CHANGING_CHANGED name the two variants the in-process ` +
          `control flips between, so they have to be the file's.`,
      );
    }
  }
  if (!Object.prototype.hasOwnProperty.call(changing.variants, changingVariant)) {
    throw new Error(
      `provider-tck: canonicalFlagSet was asked for changing variant '${changingVariant}', which ` +
        `is not a variant of '${CHANGING_FLAG_KEY}' (${Object.keys(changing.variants).join(', ')})`,
    );
  }
  changing.defaultVariant = changingVariant;

  return configuration;
}

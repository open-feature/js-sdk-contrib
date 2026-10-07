import { readFileSync } from 'node:fs';
import type { InMemoryProvider } from '@openfeature/server-sdk';
import { CANONICAL_FLAGS_PATH } from './assets';

/**
 * The in-memory provider's flag configuration.
 *
 * Derived from the constructor because the SDK declares `FlagConfiguration` but does not re-export
 * it, so importing it directly is a TS2459. `NonNullable` is load-bearing: the constructor parameter
 * is optional, so the bare `ConstructorParameters<...>[0]` includes `undefined`.
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
 * Dropped wherever the format lets it appear, but *not* from inside a variant's value: a value is
 * opaque application data, and an object flag whose payload happened to carry a `$comment` member
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
 * Every failure throws with the key in the message. A failure means the pinned assets and this
 * loader disagree about the file's shape, which moving the pin should surface loudly rather than
 * leave a run limping on with a partial flag set.
 */
function flagDefinition(key: string, raw: unknown): FlagDefinition {
  if (!isRecord(raw)) {
    throw new Error(`tck: canonical flag '${key}' is not an object`);
  }

  const { state, variants, defaultVariant } = withoutComments(raw);

  if (state !== ENABLED && state !== DISABLED) {
    throw new Error(
      `tck: canonical flag '${key}' has state ${JSON.stringify(state)}, which is neither ` +
        `'${ENABLED}' nor '${DISABLED}'`,
    );
  }
  if (!isRecord(variants)) {
    throw new Error(`tck: canonical flag '${key}' has no variants object`);
  }
  if (typeof defaultVariant !== 'string') {
    throw new Error(`tck: canonical flag '${key}' has no defaultVariant`);
  }

  const named = withoutComments(variants);
  if (!Object.prototype.hasOwnProperty.call(named, defaultVariant)) {
    throw new Error(
      `tck: canonical flag '${key}' names default variant '${defaultVariant}', which is ` +
        `not one of its variants (${Object.keys(named).join(', ')})`,
    );
  }

  return {
    variants: named,
    defaultVariant,
    // The format states what a flag is; the SDK's configuration states what it is not.
    disabled: state === DISABLED,
  } as FlagDefinition;
}

/**
 * The canonical flag file's text, read once.
 *
 * Held as text rather than parsed so every call to {@link canonicalFlagSet} can `JSON.parse` it
 * afresh. The provider is handed the configuration directly, so two callers sharing one object graph
 * would let a mutation in one scenario outlive it.
 */
const canonicalFlagsText = readFileSync(CANONICAL_FLAGS_PATH, 'utf8');

/**
 * The canonical flag set, as an in-memory provider configuration.
 *
 * **Parsed out of `flags/canonical-flags.json`, not transcribed from it.** A TypeScript literal
 * would drift silently: the in-memory self-test would go green against a flag set that is no longer
 * the canonical one.
 *
 * The file's own load-bearing properties are documented beside it, in
 * [`specification/assets/provider-tck/README.md`](https://github.com/open-feature/spec/blob/main/specification/assets/provider-tck/README.md).
 * Three of them meet JavaScript here:
 *
 * - `targeting-key-flag`'s rule is *data* in the file while an `InMemoryProvider` rule is a
 *   *function*, so its `targeting` member is inert for this decoder and the in-memory suites leave
 *   `@targeting` undeclared rather than synthesise an evaluator;
 * - the falsy `*-zero-flag` values survive `JSON.parse`, and nothing downstream tests a variant value
 *   for truthiness — a `value || default` on the way would read as a provider defect;
 * - `huge-integer-flag` is 2^53 − 1, which a JavaScript number holds exactly.
 *
 * @param changingVariant which variant `changing-flag` resolves to. The in-process control flips it
 *   to produce a real configuration change; every other flag comes from the file untouched.
 */
export function canonicalFlagSet(changingVariant: string = CHANGING_BASELINE): FlagConfiguration {
  const file: CanonicalFlagFile = JSON.parse(canonicalFlagsText);

  if (!isRecord(file.flags)) {
    throw new Error(`tck: ${CANONICAL_FLAGS_PATH} has no 'flags' object`);
  }

  const entries = Object.entries(withoutComments(file.flags));
  if (!entries.length) {
    throw new Error(`tck: ${CANONICAL_FLAGS_PATH} defines no flags`);
  }

  const configuration: FlagConfiguration = {};
  for (const [key, raw] of entries) {
    configuration[key] = flagDefinition(key, raw);
  }

  // `changing-flag` is the one flag whose default variant the suite chooses rather than reads, so it
  // is the one whose variant *names* this module has to agree with the file about. A rename upstream
  // would otherwise leave the control setting a default variant the flag does not have, which
  // surfaces as a resolution failure far from the cause.
  const changing = configuration[CHANGING_FLAG_KEY];
  if (!changing) {
    throw new Error(
      `tck: ${CANONICAL_FLAGS_PATH} defines no '${CHANGING_FLAG_KEY}', which is the flag ` +
        `the change-event scenarios mutate`,
    );
  }
  for (const variant of [CHANGING_BASELINE, CHANGING_CHANGED]) {
    if (!Object.prototype.hasOwnProperty.call(changing.variants, variant)) {
      throw new Error(
        `tck: '${CHANGING_FLAG_KEY}' in ${CANONICAL_FLAGS_PATH} has no '${variant}' ` +
          `variant. CHANGING_BASELINE and CHANGING_CHANGED name the two variants the in-process ` +
          `control flips between, so they have to be the file's.`,
      );
    }
  }
  if (!Object.prototype.hasOwnProperty.call(changing.variants, changingVariant)) {
    throw new Error(
      `tck: canonicalFlagSet was asked for changing variant '${changingVariant}', which ` +
        `is not a variant of '${CHANGING_FLAG_KEY}' (${Object.keys(changing.variants).join(', ')})`,
    );
  }
  changing.defaultVariant = changingVariant;

  return configuration;
}

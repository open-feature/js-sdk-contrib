/**
 * The five flag types the Evaluation API exposes, as the feature files name them.
 *
 * `Integer` and `Float` are distinct in the Gherkin but both resolve through `getNumberDetails`
 * here, JavaScript having a single `number` type — see {@link Capability.NumericCoercion}.
 */
export type FlagType = 'Boolean' | 'String' | 'Integer' | 'Float' | 'Object';

const FLAG_TYPES: readonly FlagType[] = ['Boolean', 'String', 'Integer', 'Float', 'Object'];

/** Resolves the type named in a scenario, case-insensitively. */
export function parseFlagType(raw: string): FlagType {
  const found = FLAG_TYPES.find((type) => type.toLowerCase() === raw.trim().toLowerCase());
  if (!found) {
    throw new Error(`unknown flag type '${raw}': expected one of ${FLAG_TYPES.join(', ')}`);
  }
  return found;
}

/**
 * The wider vocabulary a **context** table writes values in: the flag types, plus the two that an
 * evaluation context carries and no flag accessor returns.
 *
 * Both exist for cross-binding reasons rather than for this language's benefit. `Long` is what a
 * feature file has to say in a binding whose integers are bounded — Java's `getIntegerDetails`
 * cannot ask for more than 32 bits, so a 64-bit targeting value is declared as a `Long` there — and
 * a file written that way has to run here unchanged. `StringList` is a context key a targeting
 * operator reads as a list, which no flag type covers.
 *
 * It follows that the Java binding's *second* conversion, which widens an out-of-range `Integer` in
 * a context entry instead of refusing it, has no analogue here: see {@link parseContextValue}.
 */
export type ContextType = FlagType | 'Long' | 'StringList';

const CONTEXT_TYPES: readonly ContextType[] = [...FLAG_TYPES, 'Long', 'StringList'];

/** Resolves the type named in a context row, case-insensitively. */
export function parseContextType(raw: string): ContextType {
  const found = CONTEXT_TYPES.find((type) => type.toLowerCase() === raw.trim().toLowerCase());
  if (!found) {
    throw new Error(`unknown context value type '${raw}': expected one of ${CONTEXT_TYPES.join(', ')}`);
  }
  return found;
}

/**
 * The four types flag metadata can carry, as the specification's own table names them.
 *
 * Narrower than {@link FlagType} because metadata is a flat map of primitives — there is no `Object`
 * entry to resolve — and narrowing it here is what turns a row declaring one into a refusal naming
 * the vocabulary rather than a value mismatch that sends the reader looking at the provider.
 */
export type MetadataType = 'String' | 'Boolean' | 'Integer' | 'Float';

const METADATA_TYPES: readonly MetadataType[] = ['String', 'Boolean', 'Integer', 'Float'];

/** Resolves the type named in a metadata row, case-insensitively. */
export function parseMetadataType(raw: string): MetadataType {
  const found = METADATA_TYPES.find((type) => type.toLowerCase() === raw.trim().toLowerCase());
  if (!found) {
    throw new Error(`unknown metadata type '${raw}': flag metadata is ${METADATA_TYPES.join(', ')}`);
  }
  return found;
}

/**
 * Converts a value written in a context table into what an evaluation context takes.
 *
 * {@link parseValue} plus the two wider types. `Long` goes down the same numeric path as `Integer`,
 * this language having one number type, which is why there is no separate widening rule to port: the
 * flag-value conversion here never *refuses* a wide `Integer` in the first place, so a context entry
 * has nothing to be more permissive than. The limit `number` does impose is precision rather than
 * range, and it is the same limit for both names.
 */
export function parseContextValue(type: ContextType, raw: string): unknown {
  switch (type) {
    case 'Long':
      return parseValue('Integer', raw);
    case 'StringList':
      // A targeting operator reading an empty list matches nothing, where [''] matches a key
      // nobody has -- so an empty cell is the empty list, not a list holding the empty string.
      return raw.trim() === '' ? [] : raw.split(',').map((entry) => entry.trim());
    default:
      return parseValue(type, raw);
  }
}

/**
 * Converts a value written in a scenario into the type the Evaluation API uses.
 *
 * Everything in Gherkin is a string, so this is where `"0.5"` becomes a number and `"{}"` becomes an
 * empty object. An empty cell is a value too: `""` is what the empty-string scenario resolves to.
 */
export function parseValue(type: FlagType, raw: string): unknown {
  switch (type) {
    case 'Boolean': {
      const lowered = raw.trim().toLowerCase();
      if (['true', 't', 'yes', '1'].includes(lowered)) return true;
      if (['false', 'f', 'no', '0'].includes(lowered)) return false;
      throw new Error(`'${raw}' is not a boolean`);
    }
    case 'String':
      return raw;
    case 'Integer':
    case 'Float': {
      // `Number('')` is 0, not NaN, so a blank cell has to be refused explicitly or a scenario
      // asking for nothing would silently ask for zero.
      const value = raw.trim() === '' ? Number.NaN : Number(raw);
      if (Number.isNaN(value)) {
        throw new Error(`'${raw}' is not a number`);
      }
      return value;
    }
    case 'Object':
      try {
        return JSON.parse(raw.replace(/\\"/g, '"'));
      } catch (error) {
        throw new Error(`'${raw}' is not valid JSON: ${(error as Error).message}`);
      }
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Compares an expected value from a scenario with what a provider actually resolved.
 *
 * Structural for objects and arrays, strict for everything else. A boolean only ever equals a
 * boolean, so a type-mismatch scenario cannot be satisfied by a coincidental truthy match.
 */
export function valuesEqual(expected: unknown, actual: unknown): boolean {
  if (typeof expected === 'boolean' || typeof actual === 'boolean') {
    return typeof expected === 'boolean' && typeof actual === 'boolean' && expected === actual;
  }

  if (isPlainObject(expected) && isPlainObject(actual)) {
    const expectedKeys = Object.keys(expected);
    const actualKeys = Object.keys(actual);
    return (
      expectedKeys.length === actualKeys.length &&
      expectedKeys.every((key) => key in actual && valuesEqual(expected[key], actual[key]))
    );
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    return expected.length === actual.length && expected.every((item, index) => valuesEqual(item, actual[index]));
  }

  return expected === actual;
}

/**
 * Renders a value for a failure message, including its type.
 *
 * "expected 100 but got 100" is the single most confusing failure a cross-language conformance suite
 * can produce.
 */
export function describe(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  const rendered = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return `${rendered} (${typeof value})`;
}

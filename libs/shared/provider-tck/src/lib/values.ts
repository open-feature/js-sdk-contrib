/**
 * The five flag types the Evaluation API exposes, as the feature files name them.
 *
 * `Integer` and `Float` are distinct in the Gherkin but both resolve through `getNumberDetails`
 * here, because JavaScript has a single `number` type. That is the one place where the shared
 * scenarios cannot mean quite the same thing in this language — see
 * {@link Capability.StrictNumericTyping}.
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
 * Converts a value written in a scenario into the type the Evaluation API uses.
 *
 * Everything in Gherkin is a string, so this is where `"0.5"` becomes a number and `"{}"` becomes an
 * empty object.
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
      const value = Number(raw);
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
 * boolean, so the scenarios that ask for a boolean flag as some other type cannot be satisfied by a
 * coincidental truthy match.
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

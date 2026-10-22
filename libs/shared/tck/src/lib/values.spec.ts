import { parseContextType, parseContextValue, parseMetadataType, parseValue } from './values';

/**
 * Everything in a feature file is a string, and each of these is a way the conversion could look
 * right while turning a scenario's expected value into something else.
 */
describe('parseValue', () => {
  it('keeps an empty String cell as the empty string', () => {
    // The empty-string scenario writes "" as an empty Examples cell. It is a value, not an absence.
    expect(parseValue('String', '')).toBe('');
  });

  it('parses the two precision values exactly', () => {
    expect(parseValue('Integer', '2147483647')).toBe(2147483647);
    expect(parseValue('Integer', '9007199254740991')).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('reads an integer asked for as a float, and an integral float as an integer, as the same number', () => {
    // One number type, so the expected value is the same whichever accessor the scenario named --
    // which is why the capability is inapplicable here rather than passed or failed.
    expect(parseValue('Float', '10')).toBe(10);
    expect(parseValue('Integer', '10.0')).toBe(10);
  });

  it('refuses a blank numeric cell rather than reading it as zero', () => {
    // Number('') is 0, and integer-zero-flag exists so that a resolved 0 is never a coincidence.
    expect(() => parseValue('Integer', '')).toThrow(/is not a number/);
    expect(() => parseValue('Float', '   ')).toThrow(/is not a number/);
  });
});

/**
 * The wider vocabulary a context table writes values in.
 *
 * `Long` and `StringList` exist here for a feature file written against another binding, so the test
 * that matters is that both are accepted and that a `StringList` becomes a list rather than one
 * comma-joined string.
 */
describe('parseContextValue', () => {
  it('reads a Long as the same number an Integer would be', () => {
    // One number type, so the two names cannot be distinguished -- which is why no separate
    // widening rule was ported: nothing here refuses a wide Integer to be more permissive than.
    expect(parseContextValue('Long', '4294967296')).toBe(4294967296);
    expect(parseContextValue('Long', '7')).toBe(parseContextValue('Integer', '7'));
  });

  it('splits a StringList on commas and trims each entry', () => {
    expect(parseContextValue('StringList', 'a, b ,c')).toEqual(['a', 'b', 'c']);
  });

  it('reads an empty StringList cell as the empty list', () => {
    // [''] would match a key nobody has, where the empty list matches nothing -- and a targeting
    // operator reading the two behaves differently.
    expect(parseContextValue('StringList', '')).toEqual([]);
  });

  it('converts every other type exactly as a flag value would', () => {
    for (const [type, raw] of [
      ['Boolean', 'true'],
      ['String', 'x'],
      ['Float', '1.5'],
      ['Integer', '10'],
    ] as const) {
      expect(parseContextValue(type, raw)).toEqual(parseValue(type, raw));
    }
  });

  it('names the whole vocabulary when a row declares a type that is not in it', () => {
    // The failure a feature file hits first, so it has to say what it could have written.
    expect(() => parseContextType('Duration')).toThrow(/Long, StringList/);
  });
});

/** The metadata vocabulary, which is narrower than the flag one for a reason. */
describe('parseMetadataType', () => {
  it('accepts the four types the specification table uses', () => {
    for (const type of ['String', 'Boolean', 'Integer', 'Float'] as const) {
      expect(parseMetadataType(type)).toBe(type);
    }
  });

  it('refuses Object rather than comparing it', () => {
    // Flag metadata is a flat map of primitives. Refusing names the mistake; comparing would fail
    // as a value mismatch and send the reader looking at the provider.
    expect(() => parseMetadataType('Object')).toThrow(/flag metadata is String, Boolean, Integer, Float/);
  });
});

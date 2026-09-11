import { parseValue } from './values';

/**
 * The conversions from Gherkin text that the new canonical scenarios lean on.
 *
 * Everything in a feature file is a string, and each of these is a way the conversion could look
 * right while turning a scenario's expected value into something else.
 */
describe('parseValue', () => {
  it('keeps an empty String cell as the empty string', () => {
    // The empty-string scenario resolves to "" and writes it as an empty Examples cell. It is a
    // value, not an absence, and the comparison has to see exactly that.
    expect(parseValue('String', '')).toBe('');
  });

  it('parses the two precision values exactly', () => {
    expect(parseValue('Integer', '2147483647')).toBe(2147483647);
    expect(parseValue('Integer', '9007199254740991')).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('reads an integer asked for as a float, and an integral float as an integer, as the same number', () => {
    // The lossless-coercion scenarios expect "10" of both. JavaScript has one number type, so the
    // expected value is the same whichever accessor the scenario named -- which is why the
    // capability is inapplicable here rather than passed or failed.
    expect(parseValue('Float', '10')).toBe(10);
    expect(parseValue('Integer', '10.0')).toBe(10);
  });

  it('refuses a blank numeric cell rather than reading it as zero', () => {
    // Number('') is 0. A scenario asking for a number and giving none has a typo in it, and
    // zero-flag exists precisely so that a resolved 0 is never a coincidence.
    expect(() => parseValue('Integer', '')).toThrow(/is not a number/);
    expect(() => parseValue('Float', '   ')).toThrow(/is not a number/);
  });
});

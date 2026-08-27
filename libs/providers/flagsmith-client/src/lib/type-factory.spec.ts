import { typeFactory } from './type-factory';

describe('typeFactory', () => {
  describe('number', () => {
    it('returns numeric zero for the string "0"', () => {
      expect(typeFactory('0', 'number')).toBe(0);
    });
    it('parses numeric strings', () => {
      expect(typeFactory('99.77', 'number')).toBe(99.77);
    });
    it('passes numbers through', () => {
      expect(typeFactory(42, 'number')).toBe(42);
    });
    it('returns the raw value for non-numeric strings so evaluation rejects them', () => {
      expect(typeFactory('not-a-number', 'number')).toBe('not-a-number');
    });
    it('does not coerce empty strings', () => {
      expect(typeFactory('', 'number')).toBe('');
    });
    it('does not coerce booleans', () => {
      expect(typeFactory(true, 'number')).toBe(true);
    });
  });

  describe('boolean', () => {
    it('passes booleans through', () => {
      expect(typeFactory(true, 'boolean')).toBe(true);
      expect(typeFactory(false, 'boolean')).toBe(false);
    });
    it('returns the raw value for non-booleans so evaluation rejects them', () => {
      expect(typeFactory('true', 'boolean')).toBe('true');
      expect(typeFactory(1, 'boolean')).toBe(1);
    });
  });

  it('returns undefined for null', () => {
    expect(typeFactory(null, 'boolean')).toBeUndefined();
    expect(typeFactory(null, 'number')).toBeUndefined();
  });
});

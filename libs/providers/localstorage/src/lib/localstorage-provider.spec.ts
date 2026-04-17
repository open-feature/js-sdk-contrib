import { FlagNotFoundError, ParseError } from '@openfeature/web-sdk';
import { LocalStorageProvider } from './localstorage-provider';

describe('LocalStorage Provider', () => {
  const localStorageProvider = new LocalStorageProvider();

  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
  });

  afterAll(() => {
    localStorage.clear();
  });

  it('should match the expected metadata name', () => {
    expect(localStorageProvider.metadata.name).toBe('localStorage');
  });

  describe('resolveBooleanEvaluation', () => {
    it('should return true', () => {
      localStorage.setItem('openfeature.bool-value', 'true');
      expect(localStorageProvider.resolveBooleanEvaluation('bool-value')).toMatchObject({
        reason: 'STATIC',
        value: true,
      });
    });

    it('should return false', () => {
      localStorage.setItem('openfeature.bool-value', 'false');
      expect(localStorageProvider.resolveBooleanEvaluation('bool-value')).toMatchObject({
        reason: 'STATIC',
        value: false,
      });
    });

    it('should throw because the value was the wrong type', () => {
      localStorage.setItem('openfeature.bool-value', 'invalid');
      expect(() => localStorageProvider.resolveBooleanEvaluation('bool-value')).toThrow(ParseError);
    });
  });

  describe('resolveNumberEvaluation', () => {
    it('should return an integer', () => {
      localStorage.setItem('openfeature.num-value', '1');
      expect(localStorageProvider.resolveNumberEvaluation('num-value')).toMatchObject({
        reason: 'STATIC',
        value: 1,
      });
    });

    it('should return a float', () => {
      localStorage.setItem('openfeature.num-value', '1.25');
      expect(localStorageProvider.resolveNumberEvaluation('num-value')).toMatchObject({
        reason: 'STATIC',
        value: 1.25,
      });
    });

    it('should throw because the value was the wrong type', () => {
      localStorage.setItem('openfeature.num-value', 'invalid');
      expect(() => localStorageProvider.resolveNumberEvaluation('num-value')).toThrow(ParseError);
    });
  });

  describe('resolveStringEvaluation', () => {
    it('should return a string', () => {
      localStorage.setItem('openfeature.str-value', 'openfeature');
      expect(localStorageProvider.resolveStringEvaluation('str-value')).toMatchObject({
        reason: 'STATIC',
        value: 'openfeature',
      });
    });
  });

  describe('resolveObjectEvaluation', () => {
    it('should return a boolean', () => {
      localStorage.setItem('openfeature.obj-value', 'true');
      expect(localStorageProvider.resolveObjectEvaluation('obj-value')).toMatchObject({
        reason: 'STATIC',
        value: true,
      });
    });

    it('should return a number', () => {
      localStorage.setItem('openfeature.obj-value', '1');
      expect(localStorageProvider.resolveObjectEvaluation('obj-value')).toMatchObject({
        reason: 'STATIC',
        value: 1,
      });
    });

    it('should return a string', () => {
      localStorage.setItem('openfeature.obj-value', '"openfeature"');
      expect(localStorageProvider.resolveObjectEvaluation('obj-value')).toMatchObject({
        reason: 'STATIC',
        value: 'openfeature',
      });
    });

    it('should return an object', () => {
      localStorage.setItem('openfeature.obj-value', '{"name": "openfeature"}');
      expect(localStorageProvider.resolveObjectEvaluation('obj-value')).toMatchObject({
        reason: 'STATIC',
        value: { name: 'openfeature' },
      });
    });

    it('should return an array', () => {
      localStorage.setItem('openfeature.obj-value', '["openfeature"]');
      expect(localStorageProvider.resolveObjectEvaluation('obj-value')).toMatchObject({
        reason: 'STATIC',
        value: ['openfeature'],
      });
    });
  });

  describe('options.prefix', () => {
    it('should find a flag when the prefix is empty', () => {
      const localStorageProviderCustomPrefix = new LocalStorageProvider({ prefix: '' });
      localStorage.setItem('bool-value', 'true');
      expect(localStorageProviderCustomPrefix.resolveBooleanEvaluation('bool-value')).toMatchObject({
        reason: 'STATIC',
        value: true,
      });
    });

    it('should find a flag when the prefix is custom', () => {
      const localStorageProviderCustomPrefix = new LocalStorageProvider({ prefix: 'custom.' });
      localStorage.setItem('custom.bool-value', 'true');
      expect(localStorageProviderCustomPrefix.resolveBooleanEvaluation('bool-value')).toMatchObject({
        reason: 'STATIC',
        value: true,
      });
    });

    it('should not find a flag when the prefix does not match', () => {
      const localStorageProviderCustomPrefix = new LocalStorageProvider({ prefix: 'custom.' });
      localStorage.setItem('bool-value', 'true');
      expect(() => localStorageProviderCustomPrefix.resolveBooleanEvaluation('bool-value')).toThrow(FlagNotFoundError);
    });
  });
});

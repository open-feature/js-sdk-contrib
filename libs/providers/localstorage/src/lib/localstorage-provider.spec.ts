import { ClientProviderEvents, FlagNotFoundError, ParseError } from '@openfeature/web-sdk';
import { LocalStorageProvider } from './localstorage-provider';

const mockNoLocalStorage = () => {
  // @ts-expect-error we intentionally want to simulate an environment where localStorage is not defined (e.g., SSR)
  delete global.localStorage;
};

describe('LocalStorage Provider', () => {
  const localStorageProvider = new LocalStorageProvider();
  const originalLocalStorage = global.localStorage;

  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    global.localStorage = originalLocalStorage;
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

    it('should not find a flag if localStorage is not defined', () => {
      mockNoLocalStorage();
      expect(() => localStorageProvider.resolveBooleanEvaluation('bool-value')).toThrow(FlagNotFoundError);
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

    it('should not find a flag if localStorage is not defined', () => {
      mockNoLocalStorage();
      expect(() => localStorageProvider.resolveNumberEvaluation('num-value')).toThrow(FlagNotFoundError);
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

    it('should not find a flag if localStorage is not defined', () => {
      mockNoLocalStorage();
      expect(() => localStorageProvider.resolveStringEvaluation('str-value')).toThrow(FlagNotFoundError);
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

    it('should not find a flag if localStorage is not defined', () => {
      mockNoLocalStorage();
      expect(() => localStorageProvider.resolveObjectEvaluation('obj-value')).toThrow(FlagNotFoundError);
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

  describe('setFlags', () => {
    it('should set a flag in localStorage when the value is true', () => {
      localStorageProvider.setFlags({ 'bool-value': true });
      expect(localStorage.getItem('openfeature.bool-value')).toBe('true');
    });

    it('should set a flag in localStorage when the value is false', () => {
      localStorageProvider.setFlags({ 'bool-value': false });
      expect(localStorage.getItem('openfeature.bool-value')).toBe('false');
    });

    it('should set a flag in localStorage when the value is a number', () => {
      localStorageProvider.setFlags({ 'num-value': 1.25 });
      expect(localStorage.getItem('openfeature.num-value')).toBe('1.25');
    });

    it('should set a flag in localStorage when the value is a string', () => {
      localStorageProvider.setFlags({ 'str-value': 'openfeature' });
      expect(localStorage.getItem('openfeature.str-value')).toBe('openfeature');
    });

    it('should set a flag in localStorage when the value is an object', () => {
      localStorageProvider.setFlags({ 'obj-value': { name: 'openfeature' } });
      expect(localStorage.getItem('openfeature.obj-value')).toBe(JSON.stringify({ name: 'openfeature' }));
    });

    it('should set a flag in localStorage when the value is null', () => {
      localStorageProvider.setFlags({ 'null-value': null });
      expect(localStorage.getItem('openfeature.null-value')).toBe('null');
    });

    it('should remove a flag from localStorage when the value is undefined', () => {
      localStorage.setItem('openfeature.bool-value', 'true');
      localStorageProvider.setFlags({ 'bool-value': undefined });
      expect(localStorage.getItem('openfeature.bool-value')).toBeNull();
    });

    it('should emit a configuration changed event with the updated flags', () => {
      const mockListener = jest.fn();
      localStorageProvider.events.addHandler(ClientProviderEvents.ConfigurationChanged, mockListener);
      localStorageProvider.setFlags({ 'bool-value': true, 'str-value': undefined });
      expect(mockListener).toHaveBeenCalledWith({
        message: 'Flags updated',
        flagsChanged: ['bool-value', 'str-value'],
      });
    });

    it('should throw if localStorage is not defined', () => {
      mockNoLocalStorage();
      expect(() => localStorageProvider.setFlags({ 'bool-value': true })).toThrow(ReferenceError);
    });
  });

  describe('clearFlags', () => {
    it('should remove all flags from localStorage that match the provider prefix', () => {
      localStorage.setItem('openfeature.bool-value', 'true');
      localStorage.setItem('openfeature.num-value', '1.25');
      localStorage.setItem('otherprovider.str-value', 'openfeature');
      localStorageProvider.clearFlags();
      expect(localStorage.getItem('openfeature.bool-value')).toBeNull();
      expect(localStorage.getItem('openfeature.num-value')).toBeNull();
      expect(localStorage.getItem('otherprovider.str-value')).toBe('openfeature');
    });

    it('should emit a configuration changed event with the removed flags', () => {
      const mockListener = jest.fn();
      localStorageProvider.events.addHandler(ClientProviderEvents.ConfigurationChanged, mockListener);
      localStorage.setItem('openfeature.bool-value', 'true');
      localStorage.setItem('openfeature.num-value', '1.25');
      localStorageProvider.clearFlags();
      expect(mockListener).toHaveBeenCalledWith({
        message: 'Flags updated',
        flagsChanged: ['bool-value', 'num-value'],
      });
    });

    it('should throw if localStorage is not defined', () => {
      mockNoLocalStorage();
      expect(() => localStorageProvider.clearFlags()).toThrow(ReferenceError);
    });
  });

  describe('getFlags', () => {
    it('should return all flags from localStorage that match the provider prefix', () => {
      localStorage.setItem('openfeature.bool-value', 'true');
      localStorage.setItem('openfeature.num-value', '1.25');
      localStorage.setItem('otherprovider.str-value', 'openfeature');
      expect(localStorageProvider.getFlags()).toEqual({
        'bool-value': 'true',
        'num-value': '1.25',
      });
    });

    it('should return an empty object if no flags match the provider prefix', () => {
      localStorage.setItem('otherprovider.str-value', 'openfeature');
      expect(localStorageProvider.getFlags()).toEqual({});
    });

    it('should return an empty object if localStorage is not defined', () => {
      mockNoLocalStorage();
      expect(localStorageProvider.getFlags()).toEqual({});
    });
  });
});

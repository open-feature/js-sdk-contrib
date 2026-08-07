import { ExporterMetadata } from './exporter-metadata';

/**
 * Pinned as literals rather than imported from `constants`: these two keys are a wire contract
 * shared with the relay proxy and with the other language providers, so a change to the constant
 * has to break a test rather than quietly follow along.
 */
const RESERVED = { provider: 'nodejs', openfeature: true };

describe('ExporterMetadata', () => {
  let exporterMetadata: ExporterMetadata;

  beforeEach(() => {
    exporterMetadata = new ExporterMetadata();
  });

  describe('reserved keys', () => {
    it('should always expose provider and openfeature when nothing was added', () => {
      // Without these the collector cannot attribute an exported event to an SDK or a language.
      expect(exporterMetadata.asObject()).toEqual(RESERVED);
    });

    it('should expose them alongside caller metadata', () => {
      exporterMetadata.add('app', 'my-app');

      expect(exporterMetadata.asObject()).toEqual({ app: 'my-app', ...RESERVED });
    });

    it('should not let a caller shadow the reserved keys', () => {
      exporterMetadata.add('provider', 'python');
      exporterMetadata.add('openfeature', false);

      // `provider` is normative - the collector groups by it - so a caller-supplied value would
      // misattribute this provider's traffic to another language.
      expect(exporterMetadata.asObject()).toEqual(RESERVED);
    });
  });

  describe('add method', () => {
    it('should add string metadata', () => {
      exporterMetadata.add('testKey', 'testValue');
      const result = exporterMetadata.asObject();

      expect(result).toEqual({
        testKey: 'testValue',
        ...RESERVED,
      });
    });

    it('should add boolean metadata', () => {
      exporterMetadata.add('enabled', true);
      exporterMetadata.add('disabled', false);
      const result = exporterMetadata.asObject();

      expect(result).toEqual({
        enabled: true,
        disabled: false,
        ...RESERVED,
      });
    });

    it('should add number metadata', () => {
      exporterMetadata.add('count', 42);
      exporterMetadata.add('version', 1.5);
      const result = exporterMetadata.asObject();

      expect(result).toEqual({
        count: 42,
        version: 1.5,
        ...RESERVED,
      });
    });

    it('should overwrite existing metadata with the same key', () => {
      exporterMetadata.add('key', 'initialValue');
      exporterMetadata.add('key', 'updatedValue');
      const result = exporterMetadata.asObject();

      expect(result).toEqual({
        key: 'updatedValue',
        ...RESERVED,
      });
    });

    it('should handle multiple metadata entries', () => {
      exporterMetadata.add('stringKey', 'stringValue');
      exporterMetadata.add('booleanKey', true);
      exporterMetadata.add('numberKey', 123);
      const result = exporterMetadata.asObject();

      expect(result).toEqual({
        stringKey: 'stringValue',
        booleanKey: true,
        numberKey: 123,
        ...RESERVED,
      });
    });

    it('should handle empty string values', () => {
      exporterMetadata.add('emptyKey', '');
      const result = exporterMetadata.asObject();

      expect(result).toEqual({
        emptyKey: '',
        ...RESERVED,
      });
    });

    it('should handle zero number values', () => {
      exporterMetadata.add('zeroKey', 0);
      const result = exporterMetadata.asObject();

      expect(result).toEqual({
        zeroKey: 0,
        ...RESERVED,
      });
    });
  });

  describe('asObject method', () => {
    it('should return only the reserved keys when no metadata is added', () => {
      const result = exporterMetadata.asObject();

      expect(result).toEqual(RESERVED);
    });

    it('should return immutable object', () => {
      exporterMetadata.add('testKey', 'testValue');
      const result = exporterMetadata.asObject();

      // Verify the object is frozen (immutable)
      expect(Object.isFrozen(result)).toBe(true);
    });

    it('should return a new object instance each time', () => {
      exporterMetadata.add('testKey', 'testValue');
      const result1 = exporterMetadata.asObject();
      const result2 = exporterMetadata.asObject();

      expect(result1).toEqual(result2);
      expect(result1).not.toBe(result2); // Different object instances
    });

    it('should not be affected by subsequent add operations', () => {
      exporterMetadata.add('initialKey', 'initialValue');
      const result1 = exporterMetadata.asObject();

      exporterMetadata.add('newKey', 'newValue');
      const result2 = exporterMetadata.asObject();

      expect(result1).toEqual({
        initialKey: 'initialValue',
        ...RESERVED,
      });
      expect(result2).toEqual({
        initialKey: 'initialValue',
        newKey: 'newValue',
        ...RESERVED,
      });
    });

    it('should handle special characters in keys', () => {
      exporterMetadata.add('key-with-dashes', 'value1');
      exporterMetadata.add('key_with_underscores', 'value2');
      exporterMetadata.add('keyWithCamelCase', 'value3');
      exporterMetadata.add('key with spaces', 'value4');
      const result = exporterMetadata.asObject();

      expect(result).toEqual({
        'key-with-dashes': 'value1',
        key_with_underscores: 'value2',
        keyWithCamelCase: 'value3',
        'key with spaces': 'value4',
        ...RESERVED,
      });
    });

    it('should handle special characters in values', () => {
      exporterMetadata.add('key1', 'value with spaces');
      exporterMetadata.add('key2', 'value-with-dashes');
      exporterMetadata.add('key3', 'value_with_underscores');
      exporterMetadata.add('key4', 'valueWithCamelCase');
      const result = exporterMetadata.asObject();

      expect(result).toEqual({
        key1: 'value with spaces',
        key2: 'value-with-dashes',
        key3: 'value_with_underscores',
        key4: 'valueWithCamelCase',
        ...RESERVED,
      });
    });
  });

  describe('integration tests', () => {
    it('should maintain state across multiple operations', () => {
      // Add initial metadata
      exporterMetadata.add('app', 'my-app');
      exporterMetadata.add('version', '1.0.0');

      let result = exporterMetadata.asObject();
      expect(result).toEqual({
        app: 'my-app',
        version: '1.0.0',
        ...RESERVED,
      });

      // Add more metadata
      exporterMetadata.add('environment', 'production');
      exporterMetadata.add('debug', false);

      result = exporterMetadata.asObject();
      expect(result).toEqual({
        app: 'my-app',
        version: '1.0.0',
        environment: 'production',
        debug: false,
        ...RESERVED,
      });

      // Update existing metadata
      exporterMetadata.add('version', '2.0.0');

      result = exporterMetadata.asObject();
      expect(result).toEqual({
        app: 'my-app',
        version: '2.0.0',
        environment: 'production',
        debug: false,
        ...RESERVED,
      });
    });

    it('should handle complex metadata scenarios', () => {
      // Simulate a real-world scenario
      exporterMetadata.add('sdk', 'go-feature-flag');
      exporterMetadata.add('sdkVersion', '1.0.0');
      exporterMetadata.add('endpoint', 'http://localhost:1031');
      exporterMetadata.add('timeout', 5000);
      exporterMetadata.add('retryEnabled', true);
      exporterMetadata.add('maxRetries', 3);

      const result = exporterMetadata.asObject();

      expect(result).toEqual({
        sdk: 'go-feature-flag',
        sdkVersion: '1.0.0',
        endpoint: 'http://localhost:1031',
        timeout: 5000,
        retryEnabled: true,
        maxRetries: 3,
        ...RESERVED,
      });
    });
  });
});

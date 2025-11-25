import { ExporterMetadata } from '../model';
import { mockLogger } from '../testutil/mock-logger';
import { EnrichEvaluationContextHook } from './enrich-evaluation-context-hook';
import type { HookContext, EvaluationContext } from '@openfeature/server-sdk';
import { MapHookData } from '@openfeature/server-sdk';

describe('EnrichEvaluationContextHook', () => {
  let hook: EnrichEvaluationContextHook;

  describe('constructor', () => {
    it('should handle null metadata', () => {
      hook = new EnrichEvaluationContextHook(undefined);
      expect(hook).toBeDefined();
    });

    it('should handle empty metadata', () => {
      hook = new EnrichEvaluationContextHook(new ExporterMetadata());
      expect(hook).toBeDefined();
    });

    it('should handle metadata with values', () => {
      const metadata = new ExporterMetadata().add('version', '1.0.0').add('environment', 'test');
      hook = new EnrichEvaluationContextHook(metadata);
      expect(hook).toBeDefined();
    });
  });

  describe('before', () => {
    it('should return original context when no metadata is provided', async () => {
      hook = new EnrichEvaluationContextHook(undefined);

      const originalContext: EvaluationContext = { user: 'test-user' };

      const context: HookContext<boolean> = {
        flagKey: 'test-flag',
        defaultValue: false,
        context: originalContext,
        flagValueType: 'boolean',
        clientMetadata: { providerMetadata: { name: 'test' } },
        providerMetadata: { name: 'test' },
        logger: mockLogger,
        hookData: new MapHookData(),
      };

      const result = await hook.before(context);

      expect(result).toEqual(originalContext);
    });

    it('should enrich context with metadata when provided', async () => {
      const metadata = new ExporterMetadata().add('version', '1.0.0').add('environment', 'test');
      hook = new EnrichEvaluationContextHook(metadata);

      const originalContext: EvaluationContext = { user: 'test-user' };

      const context: HookContext<boolean> = {
        flagKey: 'test-flag',
        defaultValue: false,
        context: originalContext,
        flagValueType: 'boolean',
        clientMetadata: { providerMetadata: { name: 'test' } },
        providerMetadata: { name: 'test' },
        logger: mockLogger,
        hookData: new MapHookData(),
      };

      const result = await hook.before(context);

      // Check that the original context is preserved
      expect(result['user']).toBe('test-user');

      // Check that the metadata is added
      expect(result['gofeatureflag']).toEqual(metadata.asObject());
    });

    it('should merge metadata with existing context', async () => {
      const metadata = new ExporterMetadata().add('version', '1.0.0').add('environment', 'test');
      hook = new EnrichEvaluationContextHook(metadata);

      const originalContext: EvaluationContext = {
        user: 'test-user',
        gofeatureflag: { existing: 'value' },
      };

      const context: HookContext<boolean> = {
        flagKey: 'test-flag',
        defaultValue: false,
        context: originalContext,
        flagValueType: 'boolean',
        clientMetadata: { providerMetadata: { name: 'test' } },
        providerMetadata: { name: 'test' },
        logger: mockLogger,
        hookData: new MapHookData(),
      };

      const result = await hook.before(context);

      // Check that the original context is preserved
      expect(result['user']).toBe('test-user');

      // Check that the metadata is added (should override existing gofeatureflag)
      expect(result['gofeatureflag']).toEqual(metadata.asObject());
    });

    it('should handle empty metadata object', async () => {
      hook = new EnrichEvaluationContextHook(new ExporterMetadata());

      const originalContext: EvaluationContext = { user: 'test-user' };

      const context: HookContext<boolean> = {
        flagKey: 'test-flag',
        defaultValue: false,
        context: originalContext,
        flagValueType: 'boolean',
        clientMetadata: { providerMetadata: { name: 'test' } },
        providerMetadata: { name: 'test' },
        logger: mockLogger,
        hookData: new MapHookData(),
      };

      const result = await hook.before(context);

      // Should return original context unchanged
      expect(result).toEqual(originalContext);
    });
  });
});

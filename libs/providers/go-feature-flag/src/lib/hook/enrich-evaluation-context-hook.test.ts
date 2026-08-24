import { ExporterMetadata } from '../model';
import { EnrichEvaluationContextHook } from './enrich-evaluation-context-hook';
import type { HookContext, EvaluationContext, Logger } from '@openfeature/server-sdk';
import { MapHookData } from '@openfeature/server-sdk';

describe('EnrichEvaluationContextHook', () => {
  let hook: EnrichEvaluationContextHook;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;
  });

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
    /** Builds the hook context the SDK would pass, around a caller-supplied evaluation context. */
    const hookContextFor = (evaluationContext: EvaluationContext): HookContext<boolean> => ({
      flagKey: 'test-flag',
      defaultValue: false,
      context: evaluationContext,
      flagValueType: 'boolean',
      clientMetadata: { providerMetadata: { name: 'test' } },
      providerMetadata: { name: 'test' },
      logger: mockLogger,
      hookData: new MapHookData(),
    });

    const namespaceOf = (context: EvaluationContext) => context['gofeatureflag'] as Record<string, unknown>;

    it('should nest the metadata under exporterMetadata', async () => {
      const metadata = new ExporterMetadata().add('version', '1.0.0').add('environment', 'test');
      hook = new EnrichEvaluationContextHook(metadata);

      const result = await hook.before(hookContextFor({ user: 'test-user' }));

      // Written flat under `gofeatureflag`, the relay proxy never reads it.
      expect(namespaceOf(result)['exporterMetadata']).toEqual(metadata.asObject());
      expect(result['user']).toBe('test-user');
    });

    it('should preserve caller-owned siblings in the namespace', async () => {
      const metadata = new ExporterMetadata().add('version', '1.0.0');
      hook = new EnrichEvaluationContextHook(metadata);

      const result = await hook.before(
        hookContextFor({
          user: 'test-user',
          gofeatureflag: {
            flagList: ['flagA', 'flagB'],
            currentDateTime: '2026-01-01T00:00:00Z',
          },
        }),
      );

      // flagList and currentDateTime are caller inputs. Replacing the whole namespace discards them
      // and the evaluation then succeeds against the wrong inputs.
      expect(namespaceOf(result)).toEqual({
        flagList: ['flagA', 'flagB'],
        currentDateTime: '2026-01-01T00:00:00Z',
        exporterMetadata: metadata.asObject(),
      });
    });

    it('should replace a previous exporterMetadata rather than merge into it', async () => {
      const metadata = new ExporterMetadata().add('version', '2.0.0');
      hook = new EnrichEvaluationContextHook(metadata);

      const result = await hook.before(
        hookContextFor({
          gofeatureflag: { exporterMetadata: { version: '1.0.0', stale: 'entry' }, flagList: ['flagA'] },
        }),
      );

      expect(namespaceOf(result)).toEqual({
        flagList: ['flagA'],
        exporterMetadata: { version: '2.0.0', provider: 'nodejs', openfeature: true },
      });
    });

    it.each([
      ['a string', 'not-a-map'],
      ['an array', ['a', 'b']],
      ['null', null],
      ['a number', 42],
    ])('should replace the namespace when it is %s rather than fail', async (_label, value) => {
      const metadata = new ExporterMetadata().add('version', '1.0.0');
      hook = new EnrichEvaluationContextHook(metadata);

      const result = await hook.before(hookContextFor({ gofeatureflag: value as never }));
      expect(namespaceOf(result)).toEqual({ exporterMetadata: metadata.asObject() });
    });

    it('should still write the namespace when no metadata is configured', async () => {
      hook = new EnrichEvaluationContextHook(undefined);

      const result = await hook.before(hookContextFor({ user: 'test-user', gofeatureflag: { flagList: ['a'] } }));

      // The hook is registered unconditionally, so it must leave a well-formed namespace behind and
      // must not destroy the caller's entries on the way. Even with no caller metadata the reserved
      // keys are there, which is what gives the unconditional registration something to contribute.
      expect(namespaceOf(result)).toEqual({
        flagList: ['a'],
        exporterMetadata: { provider: 'nodejs', openfeature: true },
      });
    });

    it('should return a new context rather than mutate the caller', async () => {
      hook = new EnrichEvaluationContextHook(new ExporterMetadata().add('version', '1.0.0'));
      const originalContext: EvaluationContext = { user: 'test-user' };

      const result = await hook.before(hookContextFor(originalContext));

      expect(originalContext['gofeatureflag']).toBeUndefined();
      expect(result).not.toBe(originalContext);
    });
  });
});

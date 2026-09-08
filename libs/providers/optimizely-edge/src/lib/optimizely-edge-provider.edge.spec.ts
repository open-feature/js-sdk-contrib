import { ErrorCode, OpenFeature, StandardResolutionReasons, type Logger } from '@openfeature/web-sdk';

import { OptimizelyEdgeProvider } from './optimizely-edge-provider';
import { createStaticUniversalClient, EDGE_TEST_FLAG_KEYS } from '../test/universal-client';

const logger: Logger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

describe('OptimizelyEdgeProvider in an edge runtime', () => {
  let optimizely: ReturnType<typeof createStaticUniversalClient>;
  let provider: OptimizelyEdgeProvider;

  beforeEach(async () => {
    optimizely = createStaticUniversalClient();
    provider = new OptimizelyEdgeProvider(optimizely, { closeClientOnShutdown: true });
    await provider.initialize();
  });

  afterEach(async () => {
    await OpenFeature.clearProviders();
    await OpenFeature.clearContext();
    await provider.onClose();
  });

  it('runs with dynamic code generation disabled', () => {
    expect(() => globalThis.eval('1 + 1')).toThrow();
    expect(() => new Function('return 1')()).toThrow();
  });

  it('evaluates boolean, string, number, and object flags synchronously', () => {
    const context = { targetingKey: 'edge-user' };

    expect(provider.resolveBooleanEvaluation(EDGE_TEST_FLAG_KEYS.boolean, false, context, logger)).toMatchObject({
      value: true,
      variant: 'on',
    });
    expect(provider.resolveStringEvaluation(EDGE_TEST_FLAG_KEYS.string, '', context, logger)).toMatchObject({
      value: 'hello-edge',
      variant: 'on',
    });
    expect(provider.resolveNumberEvaluation(EDGE_TEST_FLAG_KEYS.number, 0, context, logger)).toMatchObject({
      value: 42.5,
      variant: 'on',
    });
    expect(provider.resolveObjectEvaluation(EDGE_TEST_FLAG_KEYS.object, {}, context, logger)).toMatchObject({
      value: { color: 'blue', count: 2 },
      variant: 'on',
    });
  });

  it('uses each invocation context without leaking identity between requests', () => {
    const createUserContext = jest.spyOn(optimizely, 'createUserContext');

    provider.resolveBooleanEvaluation(EDGE_TEST_FLAG_KEYS.boolean, false, { targetingKey: 'first-user' }, logger);
    provider.resolveBooleanEvaluation(EDGE_TEST_FLAG_KEYS.boolean, false, { targetingKey: 'second-user' }, logger);

    expect(createUserContext.mock.calls.map(([userId]) => userId)).toEqual(['first-user', 'second-user']);
    expect(createUserContext.mock.calls[0]?.[1]).toEqual({});
    expect(createUserContext.mock.calls[1]?.[1]).toEqual({});
  });

  it('evaluates typed values through OpenFeature with context isolated per invocation', async () => {
    const createUserContext = jest.spyOn(optimizely, 'createUserContext');
    await OpenFeature.setProviderAndWait(provider, { targetingKey: 'global-fallback' });
    const client = OpenFeature.getClient();

    expect(
      provider.withEvaluationContext({ targetingKey: 'first-request' }, () =>
        client.getBooleanValue(EDGE_TEST_FLAG_KEYS.boolean, false),
      ),
    ).toBe(true);
    expect(
      provider.withEvaluationContext({ targetingKey: 'second-request' }, () =>
        client.getStringValue(EDGE_TEST_FLAG_KEYS.string, ''),
      ),
    ).toBe('hello-edge');
    expect(
      provider.withEvaluationContext({ targetingKey: 'third-request' }, () =>
        client.getNumberValue(EDGE_TEST_FLAG_KEYS.number, 0),
      ),
    ).toBe(42.5);
    expect(
      provider.withEvaluationContext({ targetingKey: 'fourth-request' }, () =>
        client.getObjectValue(EDGE_TEST_FLAG_KEYS.object, {}),
      ),
    ).toEqual({
      color: 'blue',
      count: 2,
    });

    expect(client.getBooleanValue(EDGE_TEST_FLAG_KEYS.boolean, false)).toBe(true);

    expect(createUserContext.mock.calls.map(([userId]) => userId)).toEqual([
      'first-request',
      'second-request',
      'third-request',
      'fourth-request',
      'global-fallback',
    ]);
  });

  it('rejects asynchronous scoped-context callbacks without leaking context', async () => {
    const createUserContext = jest.spyOn(optimizely, 'createUserContext');
    await OpenFeature.setProviderAndWait(provider, { targetingKey: 'global-fallback' });
    const client = OpenFeature.getClient();

    expect(() =>
      provider.withEvaluationContext({ targetingKey: 'request-user' }, async () =>
        client.getBooleanValue(EDGE_TEST_FLAG_KEYS.boolean, false),
      ),
    ).toThrow('withEvaluationContext callbacks must be synchronous.');

    expect(client.getBooleanValue(EDGE_TEST_FLAG_KEYS.boolean, false)).toBe(true);
    expect(createUserContext.mock.calls.map(([userId]) => userId)).toEqual(['request-user', 'global-fallback']);
  });

  it('retains OpenFeature details and reports provider errors', () => {
    const success = provider.resolveStringEvaluation(
      EDGE_TEST_FLAG_KEYS.string,
      'fallback',
      {
        targetingKey: 'edge-user',
      },
      logger,
    );
    const missing = (() => {
      try {
        return provider.resolveBooleanEvaluation('missing-flag', true, { targetingKey: 'edge-user' }, logger);
      } catch (error) {
        return error;
      }
    })();

    expect(success).toMatchObject({
      value: 'hello-edge',
      variant: 'on',
      flagMetadata: { ruleKey: 'edge-string-rule' },
    });
    expect(missing).toBeInstanceOf(Error);
    expect((missing as { code?: string }).code).toBe(ErrorCode.FLAG_NOT_FOUND);
    expect(success.reason).not.toBe(StandardResolutionReasons.ERROR);
  });
});

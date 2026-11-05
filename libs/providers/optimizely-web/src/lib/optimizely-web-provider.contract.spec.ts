import { ProviderEvents, type EvaluationContext, type Logger } from '@openfeature/web-sdk';
import {
  NOTIFICATION_TYPES,
  OptimizelyDecideOption,
  type Client,
  type OptimizelyUserContext,
} from '@optimizely/optimizely-sdk';
import { OptimizelyWebProvider } from './optimizely-web-provider';
import { createStaticOptimizelyClient, OPTIMIZELY_TEST_FLAG_KEYS } from '../test/optimizely-web-test-utils';

const logger: Logger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

const context: EvaluationContext = {
  targetingKey: 'web-user-1',
  plan: 'pro',
  region: 'us-east-1',
};

describe('OptimizelyWebProvider', () => {
  let client: Client;
  let provider: OptimizelyWebProvider;

  beforeEach(async () => {
    client = createStaticOptimizelyClient();
    provider = new OptimizelyWebProvider(client);
    await provider.initialize();
  });

  afterEach(async () => {
    await provider.onClose();
    await client.close();
  });

  it('maps all supported OpenFeature value types from a synchronous Optimizely decision', () => {
    expect(provider.resolveBooleanEvaluation(OPTIMIZELY_TEST_FLAG_KEYS.boolean, false, context, logger)).toMatchObject({
      value: true,
      variant: 'on',
      flagMetadata: { ruleKey: 'boolean-rule' },
    });
    expect(provider.resolveStringEvaluation(OPTIMIZELY_TEST_FLAG_KEYS.string, '', context, logger)).toMatchObject({
      value: 'hello',
      variant: 'on',
      flagMetadata: { ruleKey: 'string-rule' },
    });
    expect(provider.resolveNumberEvaluation(OPTIMIZELY_TEST_FLAG_KEYS.number, 0, context, logger)).toMatchObject({
      value: 42.5,
      variant: 'on',
      flagMetadata: { ruleKey: 'number-rule' },
    });
    expect(
      provider.resolveBooleanEvaluation(OPTIMIZELY_TEST_FLAG_KEYS.boolVariable, false, context, logger),
    ).toMatchObject({
      value: true,
      variant: 'on',
    });
    expect(provider.resolveObjectEvaluation(OPTIMIZELY_TEST_FLAG_KEYS.object, {}, context, logger)).toMatchObject({
      value: { color: 'blue', count: 2 },
      variant: 'on',
    });
    expect(provider.resolveObjectEvaluation(OPTIMIZELY_TEST_FLAG_KEYS.multiple, {}, context, logger)).toMatchObject({
      value: { first: 'one', second: 7 },
      variant: 'on',
    });
  });

  it('reports a disabled flag without treating it as an evaluation error', () => {
    expect(provider.resolveBooleanEvaluation(OPTIMIZELY_TEST_FLAG_KEYS.disabled, true, context, logger)).toMatchObject({
      value: false,
      variant: 'off',
      reason: 'DISABLED',
    });
  });

  it('reports type mismatch and flag-not-found errors', () => {
    expect(() => provider.resolveNumberEvaluation(OPTIMIZELY_TEST_FLAG_KEYS.string, 7, context, logger)).toThrow(
      'OpenFeature number',
    );
    expect(() => provider.resolveBooleanEvaluation('missing-flag', false, context, logger)).toThrow('missing-flag');
  });

  it('requires a non-empty string targeting key', () => {
    expect(() => provider.resolveBooleanEvaluation(OPTIMIZELY_TEST_FLAG_KEYS.boolean, false, {}, logger)).toThrow(
      'targetingKey',
    );
    expect(() =>
      provider.resolveBooleanEvaluation(OPTIMIZELY_TEST_FLAG_KEYS.boolean, false, { targetingKey: '' }, logger),
    ).toThrow('targetingKey');
    expect(() =>
      provider.resolveBooleanEvaluation(
        OPTIMIZELY_TEST_FLAG_KEYS.boolean,
        false,
        { targetingKey: 123 } as unknown as EvaluationContext,
        logger,
      ),
    ).toThrow('targetingKey');
  });

  it('passes targeting key and custom attributes to the same user context', () => {
    const createUserContext = jest.spyOn(client, 'createUserContext');

    provider.resolveBooleanEvaluation(OPTIMIZELY_TEST_FLAG_KEYS.boolean, false, context, logger);

    expect(createUserContext).toHaveBeenCalledWith('web-user-1', {
      plan: 'pro',
      region: 'us-east-1',
    });
  });

  it('uses exactly one synchronous decide call per resolution', () => {
    const userContext = client.createUserContext('spy-user');
    const decide = jest.spyOn(userContext, 'decide');
    jest.spyOn(client, 'createUserContext').mockReturnValue(userContext);
    const decideAsync = jest.spyOn(userContext, 'decideAsync');

    provider.resolveBooleanEvaluation(OPTIMIZELY_TEST_FLAG_KEYS.boolean, false, context, logger);

    expect(decide).toHaveBeenCalledTimes(1);
    expect(decideAsync).not.toHaveBeenCalled();
  });

  it('routes tracking events and preserves value, revenue, and custom properties', () => {
    const trackEvent = jest.fn();
    const userContext = { trackEvent } as unknown as OptimizelyUserContext;
    jest.spyOn(client, 'createUserContext').mockReturnValue(userContext);

    provider.track('checkout', context, {
      value: 12.5,
      revenue: 1200,
      cartSize: 3,
      source: 'web',
    });

    expect(trackEvent).toHaveBeenCalledWith('checkout', {
      value: 12.5,
      revenue: 1200,
      $opt_event_properties: { cartSize: 3, source: 'web' },
    });
  });

  it('rejects EXCLUDE_VARIABLES because it breaks typed variable resolution', () => {
    expect(
      () =>
        new OptimizelyWebProvider(client, {
          decideOptions: [OptimizelyDecideOption.EXCLUDE_VARIABLES],
        }),
    ).toThrow('EXCLUDE_VARIABLES');
  });
});

describe('OptimizelyWebProvider lifecycle', () => {
  const makeClient = (close?: jest.Mock): Client => {
    let configListener: (() => void) | undefined;
    const fakeClient = {
      getOptimizelyConfig: () => ({ featuresMap: { flag: {} } }),
      onReady: jest.fn().mockResolvedValue({ success: true }),
      close: close ?? jest.fn().mockResolvedValue(undefined),
      createUserContext: jest.fn(),
      notificationCenter: {
        addNotificationListener: jest.fn((_type: string, listener: () => void) => {
          configListener = listener;
          return 42;
        }),
        removeNotificationListener: jest.fn(),
      },
      getConfigListener: () => configListener,
    } as unknown as Client & { getConfigListener: () => (() => void) | undefined };
    return fakeClient;
  };

  it('waits for readiness, emits configuration changes, and removes only its listener', async () => {
    const client = makeClient();
    const provider = new OptimizelyWebProvider(client);
    const changed = jest.fn();
    provider.events.addHandler(ProviderEvents.ConfigurationChanged, changed);

    await provider.initialize();
    expect(client.onReady).toHaveBeenCalledTimes(1);
    expect(client.notificationCenter.addNotificationListener).toHaveBeenCalledWith(
      NOTIFICATION_TYPES.OPTIMIZELY_CONFIG_UPDATE,
      expect.any(Function),
    );

    (client as Client & { getConfigListener: () => (() => void) | undefined }).getConfigListener()?.();
    expect(changed).toHaveBeenCalledTimes(1);

    await provider.onClose();
    expect(client.notificationCenter.removeNotificationListener).toHaveBeenCalledWith(42);
  });

  it('shares concurrent initialization and cleans up when close races readiness', async () => {
    let resolveReady!: () => void;
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    const client = makeClient();
    jest.mocked(client.onReady).mockReturnValue(ready);
    const provider = new OptimizelyWebProvider(client);

    const firstInitialization = provider.initialize();
    const secondInitialization = provider.initialize();
    const close = provider.onClose();
    resolveReady();
    await Promise.all([firstInitialization, secondInitialization, close]);

    expect(client.onReady).toHaveBeenCalledTimes(1);
    expect(client.notificationCenter.addNotificationListener).toHaveBeenCalledTimes(1);
    expect(client.notificationCenter.removeNotificationListener).toHaveBeenCalledTimes(1);
    expect(client.notificationCenter.removeNotificationListener).toHaveBeenCalledWith(42);
  });

  it('does not close a borrowed client by default, but closes an owned client when opted in', async () => {
    const borrowedClose = jest.fn().mockResolvedValue(undefined);
    const borrowed = makeClient(borrowedClose);
    const borrowedProvider = new OptimizelyWebProvider(borrowed);
    await borrowedProvider.initialize();
    await borrowedProvider.onClose();
    expect(borrowedClose).not.toHaveBeenCalled();

    const ownedClose = jest.fn().mockResolvedValue(undefined);
    const owned = makeClient(ownedClose);
    const ownedProvider = new OptimizelyWebProvider(owned, { closeClientOnShutdown: true });
    await ownedProvider.initialize();
    await ownedProvider.onClose();
    expect(ownedClose).toHaveBeenCalledTimes(1);
  });

  it('does not evaluate until initialized', () => {
    const provider = new OptimizelyWebProvider(makeClient());
    expect(() => provider.resolveBooleanEvaluation('flag', false, context, logger)).toThrow('initialized');
  });
});

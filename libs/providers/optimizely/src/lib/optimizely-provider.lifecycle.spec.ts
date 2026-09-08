import { OptimizelyDecideOption, type Client, type EventTags } from '@optimizely/optimizely-sdk';
import { ProviderEvents, type Logger } from '@openfeature/server-sdk';

import { createStaticOptimizelyClient, OPTIMIZELY_TEST_FLAG_KEYS } from '../test/optimizely-datafile';
import { OptimizelyProvider } from './optimizely-provider';

const logger: Logger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

describe('OptimizelyProvider lifecycle and side effects', () => {
  it('shares concurrent initialization and cleans up when close races readiness', async () => {
    let resolveReady!: () => void;
    const ready = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    const addNotificationListener = jest.fn().mockReturnValue(17);
    const removeNotificationListener = jest.fn();
    const client = {
      onReady: jest.fn().mockReturnValue(ready),
      close: jest.fn().mockResolvedValue(undefined),
      notificationCenter: { addNotificationListener, removeNotificationListener },
    } as unknown as Client;
    const provider = new OptimizelyProvider(client);

    const firstInitialization = provider.initialize();
    const secondInitialization = provider.initialize();
    const close = provider.onClose();
    resolveReady();
    await Promise.all([firstInitialization, secondInitialization, close]);

    expect(client.onReady).toHaveBeenCalledTimes(1);
    expect(addNotificationListener).toHaveBeenCalledTimes(1);
    expect(removeNotificationListener).toHaveBeenCalledTimes(1);
    expect(removeNotificationListener).toHaveBeenCalledWith(17);
  });

  it('registers one configuration listener and forwards updates', async () => {
    const client = createStaticOptimizelyClient();
    const addListener = jest.spyOn(client.notificationCenter, 'addNotificationListener');
    const provider = new OptimizelyProvider(client);
    const onConfigurationChanged = jest.fn();
    provider.events.addHandler(ProviderEvents.ConfigurationChanged, onConfigurationChanged);

    await provider.initialize();
    await provider.initialize();
    const callback = addListener.mock.calls[0]?.[1] as (() => void) | undefined;
    callback?.();

    expect(addListener).toHaveBeenCalledTimes(1);
    expect(onConfigurationChanged).toHaveBeenCalledTimes(1);
    await provider.onClose();
    await client.close();
  });

  it('removes only its listener and borrows the client by default', async () => {
    const client = createStaticOptimizelyClient();
    const removeListener = jest.spyOn(client.notificationCenter, 'removeNotificationListener');
    const close = jest.spyOn(client, 'close');
    const provider = new OptimizelyProvider(client);

    await provider.initialize();
    await provider.onClose();
    await provider.onClose();

    expect(removeListener).toHaveBeenCalledTimes(1);
    expect(close).not.toHaveBeenCalled();
    await client.close();
  });

  it('closes an owned client once', async () => {
    const client = createStaticOptimizelyClient();
    const close = jest.spyOn(client, 'close');
    const provider = new OptimizelyProvider(client, { closeClientOnShutdown: true });

    await provider.initialize();
    await Promise.all([provider.onClose(), provider.onClose()]);

    expect(close).toHaveBeenCalledTimes(1);
  });

  it('makes one asynchronous Optimizely decision per resolution', async () => {
    const client = createStaticOptimizelyClient();
    const userContext = client.createUserContext('openfeature-user');
    const decideAsync = jest.spyOn(userContext, 'decideAsync');
    jest.spyOn(client, 'createUserContext').mockReturnValue(userContext);
    const provider = new OptimizelyProvider(client);

    await provider.initialize();
    await provider.resolveStringEvaluation(
      OPTIMIZELY_TEST_FLAG_KEYS.string,
      'fallback',
      { targetingKey: 'openfeature-user' },
      logger,
    );

    expect(decideAsync).toHaveBeenCalledTimes(1);
    await provider.onClose();
    await client.close();
  });

  it('maps OpenFeature tracking details to Optimizely event tags', async () => {
    const client = createStaticOptimizelyClient();
    const userContext = client.createUserContext('openfeature-user');
    const trackEvent = jest.spyOn(userContext, 'trackEvent');
    jest.spyOn(client, 'createUserContext').mockReturnValue(userContext);
    const provider = new OptimizelyProvider(client);

    await provider.initialize();
    provider.track(
      'checkout',
      { targetingKey: 'openfeature-user', plan: 'pro' },
      { value: 9.5, revenue: 1200, coupon: 'SAVE' },
    );

    expect(trackEvent).toHaveBeenCalledWith('checkout', {
      value: 9.5,
      revenue: 1200,
      $opt_event_properties: { coupon: 'SAVE' },
    } satisfies EventTags);
    await provider.onClose();
    await client.close();
  });

  it('rejects decision options that remove variables', () => {
    const client = createStaticOptimizelyClient();

    expect(
      () =>
        new OptimizelyProvider(client, {
          decideOptions: [OptimizelyDecideOption.EXCLUDE_VARIABLES],
        }),
    ).toThrow('EXCLUDE_VARIABLES');

    return client.close();
  });
});

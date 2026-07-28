import { FlagsmithClientProvider } from './flagsmith-client-provider';
import { FlagsmithExposureHook } from './exposure-hook';
import { defaultConfig, exampleStringFlagName, exampleVariantFlagName } from './flagsmith.mocks';
import { OpenFeature } from '@openfeature/web-sdk';

const logger = {
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  reset: jest.fn(),
  warn: jest.fn(),
};

describe('FlagsmithExposureHook', () => {
  const targetingKey = 'test-user';

  beforeEach(async () => {
    jest.clearAllMocks();
    await OpenFeature.clearContexts();
    await OpenFeature.clearProviders();
  });

  const setup = async (opts: { withIdentity?: boolean } = {}) => {
    const provider = new FlagsmithClientProvider({ ...defaultConfig(), logger, enableEvents: true });
    if (opts.withIdentity !== false) await OpenFeature.setContext({ targetingKey });
    await OpenFeature.setProviderAndWait(provider);
    return {
      provider,
      client: OpenFeature.getClient(),
      hook: new FlagsmithExposureHook(provider, logger),
      trackExposureEvent: jest
        .spyOn(provider.flagsmithClient, 'trackExposureEvent')
        .mockImplementation(() => undefined),
    };
  };

  it('records an exposure when an evaluation with the hook resolves a variant', async () => {
    const { client, hook, trackExposureEvent } = await setup();
    const details = client.getStringDetails(exampleVariantFlagName, 'fallback', { hooks: [hook] });
    expect(details.value).toBe('treatment-value');
    expect(details.reason).toBe('TARGETING_MATCH');
    expect(trackExposureEvent).toHaveBeenCalledWith(exampleVariantFlagName, {
      identifier: targetingKey,
      value: 'treatment',
      metadata: {},
    });
  });

  it('ignores flags without a variant', async () => {
    const { client, hook, trackExposureEvent } = await setup();
    client.getStringDetails(exampleStringFlagName, 'fallback', { hooks: [hook] });
    expect(trackExposureEvent).not.toHaveBeenCalled();
  });

  it('skips and debug-logs when the resolution is not a server-side targeting match', async () => {
    const { client, hook, trackExposureEvent } = await setup({ withIdentity: false });
    const details = client.getStringDetails(exampleVariantFlagName, 'fallback', { hooks: [hook] });
    expect(details.reason).toBe('STATIC');
    expect(trackExposureEvent).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('TARGETING_MATCH'));
  });

  it('dedupes repeated evaluations of the same identity, flag and variant', async () => {
    const { client, hook, trackExposureEvent } = await setup();
    client.getStringDetails(exampleVariantFlagName, 'fallback', { hooks: [hook] });
    client.getStringDetails(exampleVariantFlagName, 'fallback', { hooks: [hook] });
    expect(trackExposureEvent).toHaveBeenCalledTimes(1);
  });

  it('records again when the identity changes', async () => {
    const { client, hook, trackExposureEvent } = await setup();
    client.getStringDetails(exampleVariantFlagName, 'fallback', { hooks: [hook] });
    await OpenFeature.setContext({ targetingKey: 'other-user' });
    client.getStringDetails(exampleVariantFlagName, 'fallback', { hooks: [hook] });
    expect(trackExposureEvent).toHaveBeenCalledTimes(2);
    expect(trackExposureEvent).toHaveBeenLastCalledWith(exampleVariantFlagName, {
      identifier: 'other-user',
      value: 'treatment',
      metadata: {},
    });
  });

  it('never breaks the evaluation when recording the exposure fails', async () => {
    const { client, hook, trackExposureEvent } = await setup();
    trackExposureEvent.mockImplementation(() => {
      throw new Error('events pipeline exploded');
    });
    const details = client.getStringDetails(exampleVariantFlagName, 'fallback', { hooks: [hook] });
    expect(details.value).toBe('treatment-value');
    expect(details.reason).toBe('TARGETING_MATCH');
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('exposure'));
  });
});

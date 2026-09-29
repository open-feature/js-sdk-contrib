import { ErrorCode, OpenFeature, StandardResolutionReasons } from '@openfeature/server-sdk';
import type { Client as OptimizelyClient } from '@optimizely/optimizely-sdk';

import { OptimizelyProvider } from './optimizely-provider';
import { createStaticOptimizelyClient, OPTIMIZELY_TEST_FLAG_KEYS } from '../test/optimizely-datafile';

describe('OptimizelyProvider through OpenFeature', () => {
  let optimizely: OptimizelyClient;

  beforeEach(async () => {
    optimizely = createStaticOptimizelyClient();
    await OpenFeature.setProviderAndWait(new OptimizelyProvider(optimizely, { closeClientOnShutdown: true }));
  });

  afterEach(async () => {
    await OpenFeature.clearProviders();
  });

  it('evaluates all supported OpenFeature value types', async () => {
    const client = OpenFeature.getClient({ targetingKey: 'openfeature-user' });

    await expect(client.getBooleanValue(OPTIMIZELY_TEST_FLAG_KEYS.boolean, false)).resolves.toBe(true);
    await expect(client.getStringValue(OPTIMIZELY_TEST_FLAG_KEYS.string, '')).resolves.toBe('hello');
    await expect(client.getNumberValue(OPTIMIZELY_TEST_FLAG_KEYS.number, 0)).resolves.toBe(42.5);
    await expect(client.getBooleanValue(OPTIMIZELY_TEST_FLAG_KEYS.boolVariable, false)).resolves.toBe(true);
    await expect(client.getObjectValue(OPTIMIZELY_TEST_FLAG_KEYS.object, {})).resolves.toEqual({
      color: 'blue',
      count: 2,
    });
    await expect(client.getObjectValue(OPTIMIZELY_TEST_FLAG_KEYS.multiple, {})).resolves.toEqual({
      first: 'one',
      second: 7,
    });
  });

  it('preserves the Optimizely variation and rule metadata in details', async () => {
    const client = OpenFeature.getClient({ targetingKey: 'openfeature-user' });
    const details = await client.getStringDetails(OPTIMIZELY_TEST_FLAG_KEYS.string, 'fallback');

    expect(details.value).toBe('hello');
    expect(details.variant).toBe('on');
    expect(details.flagMetadata).toEqual(expect.objectContaining({ ruleKey: 'string-rule' }));
  });

  it('reports disabled decisions as successful disabled resolutions', async () => {
    const client = OpenFeature.getClient({ targetingKey: 'openfeature-user' });
    const details = await client.getBooleanDetails(OPTIMIZELY_TEST_FLAG_KEYS.disabled, true);

    expect(details.value).toBe(false);
    expect(details.reason).toBe(StandardResolutionReasons.DISABLED);
    expect(details.errorCode).toBeUndefined();
  });

  it('returns the caller default and detailed error for missing flags', async () => {
    const client = OpenFeature.getClient({ targetingKey: 'openfeature-user' });
    const details = await client.getBooleanDetails('does-not-exist', true);

    expect(details.value).toBe(true);
    expect(details.reason).toBe(StandardResolutionReasons.ERROR);
    expect(details.errorCode).toBe(ErrorCode.FLAG_NOT_FOUND);
  });

  it('returns a type mismatch when the requested OpenFeature type is incompatible', async () => {
    const client = OpenFeature.getClient({ targetingKey: 'openfeature-user' });
    const details = await client.getBooleanDetails(OPTIMIZELY_TEST_FLAG_KEYS.string, false);

    expect(details.value).toBe(false);
    expect(details.reason).toBe(StandardResolutionReasons.ERROR);
    expect(details.errorCode).toBe(ErrorCode.TYPE_MISMATCH);
  });

  it('merges client context with per-evaluation context and forwards it to Optimizely', async () => {
    const createUserContext = jest.spyOn(optimizely, 'createUserContext');
    const client = OpenFeature.getClient({
      targetingKey: 'base-user',
      plan: 'pro',
    });

    await client.getBooleanValue(OPTIMIZELY_TEST_FLAG_KEYS.boolean, false, {
      targetingKey: 'request-user',
      region: 'us-east',
    });

    expect(createUserContext).toHaveBeenCalledWith('request-user', {
      plan: 'pro',
      region: 'us-east',
    });
  });

  it('closes a provider-owned Optimizely client when the provider is replaced', async () => {
    const close = jest.spyOn(optimizely, 'close');
    await OpenFeature.clearProviders();

    expect(close).toHaveBeenCalledTimes(1);
    optimizely = createStaticOptimizelyClient();
    await OpenFeature.setProviderAndWait(new OptimizelyProvider(optimizely, { closeClientOnShutdown: true }));
  });
});

import { ErrorCode, OpenFeature, StandardResolutionReasons } from '@openfeature/web-sdk';
import { __platforms, type Client as OptimizelyClient } from '@optimizely/optimizely-sdk';

import { createStaticOptimizelyClient, OPTIMIZELY_TEST_FLAG_KEYS } from '../test/optimizely-web-test-utils';
import { OptimizelyWebProvider } from './optimizely-web-provider';

describe('OptimizelyWebProvider through OpenFeature', () => {
  let optimizely: OptimizelyClient;

  beforeEach(async () => {
    optimizely = createStaticOptimizelyClient();
    await OpenFeature.setProviderAndWait(new OptimizelyWebProvider(optimizely, { closeClientOnShutdown: true }), {
      targetingKey: 'browser-user',
      plan: 'pro',
    });
  });

  afterEach(async () => {
    await OpenFeature.clearProviders();
  });

  it('loads the Optimizely browser SDK export in the jsdom test runtime', () => {
    expect(__platforms).toContain('browser');
  });

  it('evaluates typed flags synchronously through the web SDK', () => {
    const client = OpenFeature.getClient();

    expect(client.getBooleanValue(OPTIMIZELY_TEST_FLAG_KEYS.boolean, false)).toBe(true);
    expect(client.getStringValue(OPTIMIZELY_TEST_FLAG_KEYS.string, '')).toBe('hello');
    expect(client.getNumberValue(OPTIMIZELY_TEST_FLAG_KEYS.number, 0)).toBe(42.5);
    expect(client.getObjectValue(OPTIMIZELY_TEST_FLAG_KEYS.object, {})).toEqual({
      color: 'blue',
      count: 2,
    });
  });

  it('preserves decision details and converts provider errors to defaults', () => {
    const client = OpenFeature.getClient();
    const success = client.getStringDetails(OPTIMIZELY_TEST_FLAG_KEYS.string, 'fallback');
    const missing = client.getBooleanDetails('missing-flag', true);
    const mismatch = client.getBooleanDetails(OPTIMIZELY_TEST_FLAG_KEYS.string, false);

    expect(success).toMatchObject({
      value: 'hello',
      variant: 'on',
      flagMetadata: { ruleKey: 'string-rule' },
    });
    expect(missing).toMatchObject({
      value: true,
      reason: StandardResolutionReasons.ERROR,
      errorCode: ErrorCode.FLAG_NOT_FOUND,
    });
    expect(mismatch).toMatchObject({
      value: false,
      reason: StandardResolutionReasons.ERROR,
      errorCode: ErrorCode.TYPE_MISMATCH,
    });
  });
});

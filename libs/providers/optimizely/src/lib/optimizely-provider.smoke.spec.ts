import { OpenFeature } from '@openfeature/server-sdk';
import { createInstance, createPollingProjectConfigManager, OptimizelyDecideOption } from '@optimizely/optimizely-sdk';

import { OptimizelyProvider } from './optimizely-provider';

type SmokeFlag = {
  key: string;
  type: 'boolean' | 'string' | 'number' | 'object';
  expected?: string;
};

const environment = (name: string): string | undefined => process.env[name]?.trim() || undefined;

const smokeFlags: SmokeFlag[] = [
  {
    key: environment('OPTIMIZELY_SMOKE_BOOLEAN_FLAG') ?? '',
    type: 'boolean' as const,
    expected: environment('OPTIMIZELY_SMOKE_BOOLEAN_EXPECTED'),
  },
  {
    key: environment('OPTIMIZELY_SMOKE_STRING_FLAG') ?? '',
    type: 'string' as const,
    expected: environment('OPTIMIZELY_SMOKE_STRING_EXPECTED'),
  },
  {
    key: environment('OPTIMIZELY_SMOKE_NUMBER_FLAG') ?? '',
    type: 'number' as const,
    expected: environment('OPTIMIZELY_SMOKE_NUMBER_EXPECTED'),
  },
  {
    key: environment('OPTIMIZELY_SMOKE_OBJECT_FLAG') ?? '',
    type: 'object' as const,
    expected: environment('OPTIMIZELY_SMOKE_OBJECT_EXPECTED'),
  },
].filter((flag) => flag.key.length > 0);

const runSmokeTests = Boolean(environment('OPTIMIZELY_SDK_KEY') && smokeFlags.length > 0);
const describeSmoke = runSmokeTests ? describe : describe.skip;

describeSmoke('OptimizelyProvider live smoke test', () => {
  beforeEach(async () => {
    // The SDK key is read from the process environment only. This suite is
    // intentionally opt-in and never loads .env files or mutates Optimizely.
    const projectConfigManager = createPollingProjectConfigManager({
      sdkKey: environment('OPTIMIZELY_SDK_KEY') as string,
      datafileAccessToken: environment('OPTIMIZELY_DATAFILE_ACCESS_TOKEN'),
      autoUpdate: false,
    });
    const optimizely = createInstance({ projectConfigManager });

    await OpenFeature.setProviderAndWait(
      new OptimizelyProvider(optimizely, {
        closeClientOnShutdown: true,
        decideOptions: [OptimizelyDecideOption.DISABLE_DECISION_EVENT],
      }),
    );
  });

  afterEach(async () => {
    await OpenFeature.clearProviders();
  });

  it.each(smokeFlags)('evaluates the configured $type flag ($key)', async (flag) => {
    const client = OpenFeature.getClient({
      targetingKey: environment('OPTIMIZELY_SMOKE_TARGETING_KEY') ?? 'openfeature-smoke-user',
    });

    if (flag.type === 'boolean') {
      const details = await client.getBooleanDetails(flag.key, false);
      expect(details.errorCode).toBeUndefined();
      if (flag.expected !== undefined) {
        expect(details.value).toBe(flag.expected === 'true');
      }
      return;
    }

    if (flag.type === 'string') {
      const details = await client.getStringDetails(flag.key, '');
      expect(details.errorCode).toBeUndefined();
      if (flag.expected !== undefined) {
        expect(details.value).toBe(flag.expected);
      }
      return;
    }

    if (flag.type === 'number') {
      const details = await client.getNumberDetails(flag.key, 0);
      expect(details.errorCode).toBeUndefined();
      if (flag.expected !== undefined) {
        expect(details.value).toBe(Number(flag.expected));
      }
      return;
    }

    const details = await client.getObjectDetails(flag.key, {});
    expect(details.errorCode).toBeUndefined();
    if (flag.expected !== undefined) {
      expect(details.value).toEqual(JSON.parse(flag.expected));
    }
  });
});

import { OfrepWebProvider } from './ofrep-web-provider';
import { OpenFeature } from '@openfeature/web-sdk';
import TestLogger from './test-logger';
import fetchMock from 'fetch-mock-jest';
import { ChangePropagationStrategy } from './model/options';

describe('OFREPWebProvider', () => {
  beforeEach(async () => {
    fetchMock.mockClear();
    fetchMock.reset();
  });
  it('xxx', async () => {
    const provider = new OfrepWebProvider('http://localhost:1031/ofrep/', [], {
      logger: new TestLogger(),
      changePropagationStrategy: ChangePropagationStrategy.POLLING,
      pollingOptions: {
        interval: 500,
      },
    });

    const evaluateEndpoint = 'http://localhost:1031/ofrep/v1/evaluate';
    const flagChangesEndpoint = 'http://localhost:1031/ofrep/v1/flag/changes';
    const fetchResult = [
      {
        key: 'flag1',
        metadata: {
          additionalProp1: 'xxx',
        },
        reason: 'TARGETING_MATCH',
        value: 'toto',
        variant: 'Variant1',
        ETag: '9f9fc0b4',
      },
      {
        key: 'flag2',
        metadata: {
          additionalProp1: 'xxx',
        },
        reason: 'SPLIT',
        value: 'titi',
        variant: 'Variant150',
        ETag: '6c23a4',
      },
      {
        key: 'flag3',
        metadata: {
          additionalProp1: 'xxx',
        },
        reason: 'SPLIT',
        value: 'titi',
        variant: 'Variant150',
        ETag: '6c23a4',
      },
    ];

    const fetchFlagChanges = [
      {
        key: 'flag1',
        ETag: '9f9fc0b1',
      },
      {
        key: 'flag2',
        ETag: '6c23a5',
      },
      {
        key: 'flag3',
        errorCode: 'FLAG_NOT_FOUND',
        errorDetails: 'Flag not found',
      },
    ];

    fetchMock.post(evaluateEndpoint, (url, options) => {
      const t = JSON.parse(options.body as string).flags as string[];
      if (t.length === 0) {
        return fetchResult;
      }
      return fetchResult.filter((f) => t.includes(f.key));
    });
    fetchMock.post(flagChangesEndpoint, fetchFlagChanges, { overwriteRoutes: true });
    await OpenFeature.setContext({ targetingKey: 'user1' });
    await OpenFeature.setProviderAndWait(provider);
    const cli = OpenFeature.getClient();
    console.log(cli.getStringDetails('flag1', 'default'));
    console.log(cli.getStringDetails('flag3', 'default'));

    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log(cli.getStringDetails('flag3', 'default'));
  });
});

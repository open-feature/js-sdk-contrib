import { OfrepWebProvider } from './ofrep-web-provider';
import { OpenFeature } from '@openfeature/web-sdk';
import TestLogger from './test-logger';
import fetchMock from 'fetch-mock-jest';

describe('OFREPWebProvider', () => {
  beforeEach(async () => {
    fetchMock.mockClear();
    fetchMock.reset();
  });
  it('xxx', async () => {
    const provider = new OfrepWebProvider('http://localhost:1031/ofrep/', [], {
      logger: new TestLogger(),
    });

    const evaluateEndpoint = 'http://localhost:1031/ofrep/v1/evaluate';
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
        reason: 'ERROR',
        errorCode: 'FLAG_NOT_FOUND',
        errorDetails: 'Flag not found',
      },
    ];

    fetchMock.post(evaluateEndpoint, fetchResult, { overwriteRoutes: true });
    await OpenFeature.setContext({ targetingKey: 'user1' });
    await OpenFeature.setProviderAndWait(provider);
    const cli = OpenFeature.getClient();
    console.log(cli.getStringDetails('flag1', 'default'));
  });
});

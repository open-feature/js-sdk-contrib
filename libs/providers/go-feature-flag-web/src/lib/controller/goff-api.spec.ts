import fetchMock from 'fetch-mock-jest';
import { GoffApiController } from './goff-api';
import { GoFeatureFlagWebProviderOptions } from '../model';

describe('Collect Data API', () => {
  beforeEach(() => {
    fetchMock.mockClear();
    fetchMock.mockReset();
    jest.resetAllMocks();
  });

  it('should call the API to collect data with apiKey', async () => {
    fetchMock.post('https://gofeatureflag.org/v1/data/collector', 200);
    const options: GoFeatureFlagWebProviderOptions = {
      endpoint: 'https://gofeatureflag.org',
      apiTimeout: 1000,
      apiKey: '123456',
    };
    const goff = new GoffApiController(options);
    await goff.collectData(
      [
        {
          key: 'flagKey',
          contextKind: 'user',
          creationDate: 1733138237486,
          default: false,
          kind: 'feature',
          userKey: 'toto',
          value: true,
          variation: 'varA',
        },
      ],
      { provider: 'open-feature-js-sdk' },
    );
    expect(fetchMock.lastUrl()).toBe('https://gofeatureflag.org/v1/data/collector');
    expect(fetchMock.lastOptions()?.headers).toEqual({
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${options.apiKey}`,
    });
    expect(fetchMock.lastOptions()?.body).toEqual(
      JSON.stringify({
        events: [
          {
            key: 'flagKey',
            contextKind: 'user',
            creationDate: 1733138237486,
            default: false,
            kind: 'feature',
            userKey: 'toto',
            value: true,
            variation: 'varA',
          },
        ],
        meta: { provider: 'open-feature-js-sdk' },
      }),
    );
  });

  it('should call the API to collect data', async () => {
    fetchMock.post('https://gofeatureflag.org/v1/data/collector', 200);
    const options: GoFeatureFlagWebProviderOptions = {
      endpoint: 'https://gofeatureflag.org',
      apiTimeout: 1000,
    };
    const goff = new GoffApiController(options);
    await goff.collectData(
      [
        {
          key: 'flagKey',
          contextKind: 'user',
          creationDate: 1733138237486,
          default: false,
          kind: 'feature',
          userKey: 'toto',
          value: true,
          variation: 'varA',
        },
      ],
      { provider: 'open-feature-js-sdk' },
    );
    expect(fetchMock.lastUrl()).toBe('https://gofeatureflag.org/v1/data/collector');
    expect(fetchMock.lastOptions()?.headers).toEqual({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
    expect(fetchMock.lastOptions()?.body).toEqual(
      JSON.stringify({
        events: [
          {
            key: 'flagKey',
            contextKind: 'user',
            creationDate: 1733138237486,
            default: false,
            kind: 'feature',
            userKey: 'toto',
            value: true,
            variation: 'varA',
          },
        ],
        meta: { provider: 'open-feature-js-sdk' },
      }),
    );
  });

  it('should call the API to collect data with endpoint path', async () => {
    fetchMock.post('https://gofeatureflag.org/examplepath/v1/data/collector', 200);
    const options: GoFeatureFlagWebProviderOptions = {
      endpoint: 'https://gofeatureflag.org/examplepath',
      apiTimeout: 1000,
    };
    const goff = new GoffApiController(options);
    await goff.collectData(
      [
        {
          key: 'flagKey',
          contextKind: 'user',
          creationDate: 1733138237486,
          default: false,
          kind: 'feature',
          userKey: 'toto',
          value: true,
          variation: 'varA',
        },
      ],
      { provider: 'open-feature-js-sdk' },
    );
    expect(fetchMock.lastUrl()).toBe('https://gofeatureflag.org/examplepath/v1/data/collector');
    expect(fetchMock.lastOptions()?.headers).toEqual({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
    expect(fetchMock.lastOptions()?.body).toEqual(
      JSON.stringify({
        events: [
          {
            key: 'flagKey',
            contextKind: 'user',
            creationDate: 1733138237486,
            default: false,
            kind: 'feature',
            userKey: 'toto',
            value: true,
            variation: 'varA',
          },
        ],
        meta: { provider: 'open-feature-js-sdk' },
      }),
    );
  });

  it('should not call the API to collect data if no event provided', async () => {
    fetchMock.post('https://gofeatureflag.org/v1/data/collector', 200);
    const options: GoFeatureFlagWebProviderOptions = {
      endpoint: 'https://gofeatureflag.org',
      apiTimeout: 1000,
      apiKey: '123456',
    };
    const goff = new GoffApiController(options);
    await goff.collectData([], { provider: 'open-feature-js-sdk' });
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it('should throw an error if API call fails', async () => {
    fetchMock.post('https://gofeatureflag.org/v1/data/collector', 500);
    const options: GoFeatureFlagWebProviderOptions = {
      endpoint: 'https://gofeatureflag.org',
      apiTimeout: 1000,
    };
    const goff = new GoffApiController(options);
    await expect(
      goff.collectData(
        [
          {
            key: 'flagKey',
            contextKind: 'user',
            creationDate: 1733138237486,
            default: false,
            kind: 'feature',
            userKey: 'toto',
            value: true,
            variation: 'varA',
          },
        ],
        { provider: 'open-feature-js-sdk' },
      ),
    ).rejects.toThrow('impossible to send the data to the collector');
  });
});

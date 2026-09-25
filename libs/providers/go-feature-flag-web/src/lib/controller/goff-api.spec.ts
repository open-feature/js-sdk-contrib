import fetchMock from 'fetch-mock-jest';
import { GoffApiController } from './goff-api';
import type { FeatureEvent, GoFeatureFlagWebProviderOptions } from '../model';

describe('Collect Data API', () => {
  const events: FeatureEvent<boolean>[] = [
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
  ];
  const metadata = { provider: 'open-feature-js-sdk' };

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
      customHeaders: {
        'User-Agent': 'goff-web/1.0.0',
        Authorization: 'Bearer foo',
      },
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
      'User-Agent': 'goff-web/1.0.0',
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
      customHeaders: {
        'User-Agent': 'goff-web/2.0.0',
      },
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
      'User-Agent': 'goff-web/2.0.0',
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

  it.each([
    ['not configured', undefined],
    ['zero', 0],
  ])('should not schedule a timeout when apiTimeout is %s', async (_, apiTimeout) => {
    fetchMock.post('https://gofeatureflag.org/v1/data/collector', 200);
    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');
    const options: GoFeatureFlagWebProviderOptions = {
      endpoint: 'https://gofeatureflag.org',
      apiTimeout,
    };
    const goff = new GoffApiController(options);

    await goff.collectData(events, metadata);

    expect(setTimeoutSpy).not.toHaveBeenCalled();
    setTimeoutSpy.mockRestore();
  });

  it('should schedule and clear a configured apiTimeout', async () => {
    fetchMock.post('https://gofeatureflag.org/v1/data/collector', 200);
    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');
    const options: GoFeatureFlagWebProviderOptions = {
      endpoint: 'https://gofeatureflag.org',
      apiTimeout: 1000,
    };
    const goff = new GoffApiController(options);

    await goff.collectData(events, metadata);

    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), options.apiTimeout);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(setTimeoutSpy.mock.results[0].value);
    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
  });

  it('should clear a configured apiTimeout when the request fails', async () => {
    fetchMock.post('https://gofeatureflag.org/v1/data/collector', { throws: new Error('network error') });
    const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = jest.spyOn(globalThis, 'clearTimeout');
    const options: GoFeatureFlagWebProviderOptions = {
      endpoint: 'https://gofeatureflag.org',
      apiTimeout: 1000,
    };
    const goff = new GoffApiController(options);

    await expect(goff.collectData(events, metadata)).rejects.toThrow('impossible to send the data to the collector');

    expect(clearTimeoutSpy).toHaveBeenCalledWith(setTimeoutSpy.mock.results[0].value);
    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
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

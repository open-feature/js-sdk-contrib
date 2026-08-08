import { GoFeatureFlagApi } from './api';
import type { GoFeatureFlagProviderOptions } from '../go-feature-flag-provider-options';
import type { FetchAPI } from '../helper/fetch-api';
import {
  ExporterMetadata,
  NOT_MODIFIED,
  type FeatureEvent,
  type FlagConfigResponse,
  type FlagConfigurationResult,
  type TrackingEvent,
} from '../model';
import {
  FlagConfigurationEndpointNotFoundException,
  ImpossibleToRetrieveConfigurationException,
  UnauthorizedException,
  ImpossibleToSendDataToTheCollectorException,
  InvalidOptionsException,
} from '../exception';
import { MockFetch, MockResponse } from '../testutil/mock-fetch';

describe('GoFeatureFlagApi', () => {
  let mockFetch: MockFetch;
  let fetchImplementation: FetchAPI;

  beforeEach(() => {
    mockFetch = new MockFetch();
    fetchImplementation = mockFetch.fetch.bind(mockFetch) as FetchAPI;

    // Mock global fetch for tests that don't provide fetchImplementation
    (global as any).fetch = fetchImplementation;
  });

  afterEach(() => {
    mockFetch.reset();
    // Clean up global fetch mock
    delete (global as any).fetch;
  });

  describe('Constructor', () => {
    it('should throw if options are missing', () => {
      expect(() => new GoFeatureFlagApi(null as any)).toThrow(InvalidOptionsException);
    });
  });

  describe('RetrieveFlagConfiguration', () => {
    const baseOptions: GoFeatureFlagProviderOptions = {
      endpoint: 'http://localhost:8080',
      fetchImplementation,
    };

    /** Asserts the fetch returned a configuration rather than the not-modified sentinel. */
    const expectConfiguration = (result: FlagConfigurationResult): FlagConfigResponse => {
      expect(result).not.toBe(NOT_MODIFIED);
      return result as FlagConfigResponse;
    };

    it('should call the configuration endpoint', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponse('http://localhost:8080/v1/flag/configuration', new MockResponse(200, '{"flags":{}}'));

      await api.retrieveFlagConfiguration();

      const request = mockFetch.getLastRequest();
      expect(request?.url).toBe('http://localhost:8080/v1/flag/configuration');
      expect(request?.options.method).toBe('POST');
      expect(request?.options.body).toEqual(JSON.stringify({ flags: [] }));
    });

    it('should include the API key in the X-API-Key header when provided', async () => {
      const options: GoFeatureFlagProviderOptions = {
        ...baseOptions,
        apiKey: 'my-api-key',
      };
      const api = new GoFeatureFlagApi(options);
      mockFetch.setResponse('http://localhost:8080/v1/flag/configuration', new MockResponse(200, '{"flags":{}}'));

      await api.retrieveFlagConfiguration();

      const request = mockFetch.getLastRequest();
      expect(request?.options.headers).toHaveProperty('X-API-Key', 'my-api-key');
    });

    it('should not include an authentication header when API key is not provided', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponse('http://localhost:8080/v1/flag/configuration', new MockResponse(200, '{"flags":{}}'));

      await api.retrieveFlagConfiguration();

      const request = mockFetch.getLastRequest();
      expect(request?.options.headers).not.toHaveProperty('X-API-Key');
      // Retained as a migration guard: the provider used to authenticate with Authorization.
      expect(request?.options.headers).not.toHaveProperty('Authorization');
    });

    it('should not use dataCollectorBaseURL for the configuration endpoint', async () => {
      const api = new GoFeatureFlagApi({
        ...baseOptions,
        dataCollectorBaseURL: 'https://collector.example.com',
      } as GoFeatureFlagProviderOptions);
      mockFetch.setResponse('http://localhost:8080/v1/flag/configuration', new MockResponse(200, '{"flags":{}}'));

      await api.retrieveFlagConfiguration();

      // The override is scoped to the collector; configuration and evaluation stay on `endpoint`.
      expect(mockFetch.getLastRequest()?.url).toBe('http://localhost:8080/v1/flag/configuration');
    });

    describe('custom headers', () => {
      const CONFIG_URL = 'http://localhost:8080/v1/flag/configuration';

      /** Runs one configuration fetch and returns the headers that went out. */
      const headersFor = async (
        options: Partial<GoFeatureFlagProviderOptions>,
        etag?: string,
      ): Promise<Record<string, string>> => {
        const api = new GoFeatureFlagApi({ ...baseOptions, ...options } as GoFeatureFlagProviderOptions);
        mockFetch.setResponse(CONFIG_URL, new MockResponse(200, '{"flags":{}}'));

        await api.retrieveFlagConfiguration(etag);

        return mockFetch.getLastRequest()?.options.headers as Record<string, string>;
      };

      it('should send a caller-supplied header', async () => {
        const headers = await headersFor({ headers: { 'X-Api-Gateway-Key': 'gateway-secret' } });

        // A relay proxy behind a gateway could not be polled for configuration at all before this.
        expect(headers['X-Api-Gateway-Key']).toBe('gateway-secret');
      });

      it('should drop a caller X-API-Key when apiKey is configured', async () => {
        const headers = await headersFor({ apiKey: 'goff-key', headers: { 'X-API-Key': 'caller' } });

        expect(headers['X-API-Key']).toBe('goff-key');
      });

      it('should pass a caller X-API-Key through when no apiKey is configured', async () => {
        const headers = await headersFor({ headers: { 'X-API-Key': 'caller' } });

        // The provider itself sends no authentication header here; a caller who writes one into
        // `headers` has asked for it explicitly.
        expect(headers['X-API-Key']).toBe('caller');
      });

      it('should drop a caller X-API-Key given in another casing', async () => {
        const headers = await headersFor({ apiKey: 'goff-key', headers: { 'x-api-key': 'caller' } });

        // A Record holds both spellings and fetch comma-joins them, so a case-sensitive merge
        // would put `x-api-key: "caller, goff-key"` on the wire.
        expect(Object.keys(headers).filter((name) => name.toLowerCase() === 'x-api-key')).toEqual(['X-API-Key']);
        expect(headers['X-API-Key']).toBe('goff-key');
      });

      it('should send no authentication header for an empty apiKey', async () => {
        const headers = await headersFor({ apiKey: '' });

        // The requirement says "unset or empty"; only the unset case was covered before.
        expect(headers).not.toHaveProperty('X-API-Key');
      });

      it('should drop a caller Content-Type', async () => {
        const headers = await headersFor({ headers: { 'Content-Type': 'text/plain' } });

        // The body is JSON.stringify'd, so a caller value would make body and header disagree.
        expect(headers['Content-Type']).toBe('application/json');
      });

      it('should drop a caller If-None-Match and keep the poller etag', async () => {
        const headers = await headersFor({ headers: { 'If-None-Match': 'caller-etag' } }, '12345');

        // A static caller value would freeze the configuration permanently: the refresh path
        // short-circuits on the not-modified sentinel before reading anything.
        expect(headers['If-None-Match']).toBe('12345');
      });

      it('should drop a caller If-None-Match when the poller has no etag', async () => {
        const headers = await headersFor({ headers: { 'If-None-Match': 'caller-etag' } });

        expect(headers).not.toHaveProperty('If-None-Match');
      });
    });

    it('should include content-type header', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponse('http://localhost:8080/v1/flag/configuration', new MockResponse(200, '{"flags":{}}'));

      await api.retrieveFlagConfiguration();

      const request = mockFetch.getLastRequest();
      expect(request?.options.headers).toHaveProperty('Content-Type', 'application/json');
    });

    it('should include If-None-Match header when etag is provided', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponse('http://localhost:8080/v1/flag/configuration', new MockResponse(200, '{"flags":{}}'));

      await api.retrieveFlagConfiguration('12345');

      const request = mockFetch.getLastRequest();
      expect(request?.options.headers).toHaveProperty('If-None-Match', '12345');
    });

    it('should include flags in request body when provided', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponse('http://localhost:8080/v1/flag/configuration', new MockResponse(200, '{"flags":{}}'));

      await api.retrieveFlagConfiguration(undefined, ['flag1', 'flag2']);

      const request = mockFetch.getLastRequest();
      expect(request?.options.body).toBe(JSON.stringify({ flags: ['flag1', 'flag2'] }));
    });

    it('should throw UnauthorizedException on 401 response', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponseByStatus('401', new MockResponse(401, 'Unauthorized'));

      await expect(api.retrieveFlagConfiguration()).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException on 403 response', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponseByStatus('403', new MockResponse(403, 'Forbidden'));

      await expect(api.retrieveFlagConfiguration()).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ImpossibleToRetrieveConfigurationException on 400 response', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponseByStatus('400', new MockResponse(400, 'Bad Request'));

      await expect(api.retrieveFlagConfiguration()).rejects.toThrow(ImpossibleToRetrieveConfigurationException);
    });

    it('should throw ImpossibleToRetrieveConfigurationException on 500 response', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponseByStatus('500', new MockResponse(500, 'Internal Server Error'));

      await expect(api.retrieveFlagConfiguration()).rejects.toThrow(ImpossibleToRetrieveConfigurationException);
    });

    it('should throw FlagConfigurationEndpointNotFoundException on 404 response', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponseByStatus('404', new MockResponse(404, 'Not Found'));

      await expect(api.retrieveFlagConfiguration()).rejects.toThrow(FlagConfigurationEndpointNotFoundException);
    });

    it('should return valid FlagConfigResponse on 200 response', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      const responseBody = JSON.stringify({
        flags: {
          TEST: {
            variations: {
              on: true,
              off: false,
            },
            defaultRule: { variation: 'off' },
          },
          TEST2: {
            variations: {
              on: true,
              off: false,
            },
            defaultRule: { variation: 'on' },
          },
        },
        evaluationContextEnrichment: {
          env: 'production',
        },
      });

      mockFetch.setResponse(
        'http://localhost:8080/v1/flag/configuration',
        new MockResponse(200, responseBody, {
          etag: '"123456789"',
          'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT',
        }),
      );

      const result = expectConfiguration(await api.retrieveFlagConfiguration());

      expect(result.etag).toBe('"123456789"');
      expect(result.lastUpdated).toEqual(new Date('Wed, 21 Oct 2015 07:28:00 GMT'));
      expect(result.flags).toHaveProperty('TEST');
      expect(result.flags).toHaveProperty('TEST2');
      expect(result.evaluationContextEnrichment).toHaveProperty('env', 'production');
    });

    it('should return the NOT_MODIFIED sentinel on a 304 response', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponseByStatus(
        '304',
        new MockResponse(304, '', {
          etag: '"123456789"',
          'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT',
        }),
      );

      const result = await api.retrieveFlagConfiguration();

      // The sentinel carries nothing at all: no flags, no enrichment, and crucially no ETag, so a
      // 304 cannot overwrite the stored validator.
      expect(result).toBe(NOT_MODIFIED);
    });

    it('should return the NOT_MODIFIED sentinel on a 304 that echoes no ETag', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponseByStatus('304', new MockResponse(304, ''));

      const result = await api.retrieveFlagConfiguration('"123456789"');

      expect(result).toBe(NOT_MODIFIED);
    });

    it('should treat an unparseable 200 body as a failed refresh', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponse(
        'http://localhost:8080/v1/flag/configuration',
        new MockResponse(200, '<html>502 Bad Gateway</html>', { etag: '"newer-etag"' }),
      );

      await expect(api.retrieveFlagConfiguration()).rejects.toThrow(ImpossibleToRetrieveConfigurationException);
    });

    it('should treat a 200 with a null flag map as a failed refresh', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponse(
        'http://localhost:8080/v1/flag/configuration',
        new MockResponse(200, '{"flags":null}', { etag: '"newer-etag"' }),
      );

      await expect(api.retrieveFlagConfiguration()).rejects.toThrow(ImpossibleToRetrieveConfigurationException);
    });

    it('should treat a 200 with an absent flag map as a failed refresh', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponse(
        'http://localhost:8080/v1/flag/configuration',
        new MockResponse(200, '{"evaluationContextEnrichment":{"env":"production"}}', { etag: '"newer-etag"' }),
      );

      await expect(api.retrieveFlagConfiguration()).rejects.toThrow(ImpossibleToRetrieveConfigurationException);
    });

    it.each([
      ['an array', '{"flags":[]}'],
      ['a populated array', '{"flags":[{"key":"my-flag"}]}'],
      ['a string', '{"flags":"oops"}'],
      ['a number', '{"flags":42}'],
      ['a boolean', '{"flags":true}'],
    ])('should treat a 200 with %s as a flag map as a failed refresh', async (_label, body) => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponse(
        'http://localhost:8080/v1/flag/configuration',
        new MockResponse(200, body, { etag: '"newer-etag"' }),
      );

      // Not just a type check: `Object.entries` reads an array or a number as an empty
      // configuration and a string as one flag per character, and the caller would then store that
      // and advance the ETag - making the bogus configuration permanent from the next 304 on.
      await expect(api.retrieveFlagConfiguration()).rejects.toThrow(ImpossibleToRetrieveConfigurationException);
    });

    it('should accept a 200 with an explicitly empty flag map', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponse(
        'http://localhost:8080/v1/flag/configuration',
        new MockResponse(200, '{"flags":{}}', { etag: '"123456789"' }),
      );

      // A relay proxy that genuinely serves no flags is a valid configuration, not a failure.
      const result = expectConfiguration(await api.retrieveFlagConfiguration());

      expect(result.flags).toEqual({});
    });

    it('should handle invalid last-modified header', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponse(
        'http://localhost:8080/v1/flag/configuration',
        new MockResponse(200, '{"flags":{}}', {
          etag: '"123456789"',
          'last-modified': 'invalid-date',
        }),
      );

      const result = expectConfiguration(await api.retrieveFlagConfiguration());

      expect(result.lastUpdated?.getTime()).toBeNaN();
    });

    it('should handle network errors', async () => {
      const mockFetchWithError = async () => {
        throw new Error('Network error');
      };

      const optionsWithErrorFetch: GoFeatureFlagProviderOptions = {
        ...baseOptions,
        fetchImplementation: mockFetchWithError,
      };
      const apiWithError = new GoFeatureFlagApi(optionsWithErrorFetch);

      await expect(apiWithError.retrieveFlagConfiguration()).rejects.toThrow(
        ImpossibleToRetrieveConfigurationException,
      );
    });

    it('should handle timeout', async () => {
      const mockFetchWithDelay = async (url: string, options: RequestInit = {}) => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (options.signal && (options.signal as AbortSignal).aborted) {
          throw new Error('Request aborted');
        }
        return new MockResponse(200, '{"flags":{}}');
      };

      const optionsWithDelayFetch: GoFeatureFlagProviderOptions = {
        ...baseOptions,
        fetchImplementation: mockFetchWithDelay as unknown as FetchAPI,
        timeout: 1,
      };
      const apiWithDelay = new GoFeatureFlagApi(optionsWithDelayFetch);

      await expect(apiWithDelay.retrieveFlagConfiguration()).rejects.toThrow(
        ImpossibleToRetrieveConfigurationException,
      );
    });
  });

  describe('SendEventToDataCollector', () => {
    const baseOptions: GoFeatureFlagProviderOptions = {
      endpoint: 'http://localhost:8080',
      fetchImplementation,
    };

    it('should call the data collector endpoint', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponse('http://localhost:8080/v1/data/collector', new MockResponse(200, 'Success'));

      const events: FeatureEvent[] | TrackingEvent[] = [];
      const metadata: ExporterMetadata = new ExporterMetadata();

      await api.sendEventToDataCollector(events, metadata);

      const request = mockFetch.getLastRequest();
      expect(request?.url).toBe('http://localhost:8080/v1/data/collector');
      expect(request?.options.method).toBe('POST');
    });

    it('should include the API key in the X-API-Key header when provided', async () => {
      const options: GoFeatureFlagProviderOptions = {
        ...baseOptions,
        apiKey: 'my-api-key',
      };
      const api = new GoFeatureFlagApi(options);
      mockFetch.setResponse('http://localhost:8080/v1/data/collector', new MockResponse(200, 'Success'));

      const events: FeatureEvent[] | TrackingEvent[] = [];
      const metadata: ExporterMetadata = new ExporterMetadata();

      await api.sendEventToDataCollector(events, metadata);

      const request = mockFetch.getLastRequest();
      expect(request?.options.headers).toHaveProperty('X-API-Key', 'my-api-key');
    });

    it('should not include an authentication header when API key is not provided', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponse('http://localhost:8080/v1/data/collector', new MockResponse(200, 'Success'));

      const events: FeatureEvent[] | TrackingEvent[] = [];
      const metadata: ExporterMetadata = new ExporterMetadata();

      await api.sendEventToDataCollector(events, metadata);

      const request = mockFetch.getLastRequest();
      expect(request?.options.headers).not.toHaveProperty('X-API-Key');
      // Retained as a migration guard: the provider used to authenticate with Authorization.
      expect(request?.options.headers).not.toHaveProperty('Authorization');
    });

    describe('dataCollectorBaseURL', () => {
      /** Sends one batch and returns the request that went out. */
      const requestFor = async (options: Partial<GoFeatureFlagProviderOptions>, url: string) => {
        const api = new GoFeatureFlagApi({ ...baseOptions, ...options } as GoFeatureFlagProviderOptions);
        mockFetch.setResponse(url, new MockResponse(200, 'Success'));

        await api.sendEventToDataCollector([], new ExporterMetadata());

        return mockFetch.getLastRequest();
      };

      it('should fall back to endpoint when unset', async () => {
        const request = await requestFor({}, 'http://localhost:8080/v1/data/collector');

        expect(request?.url).toBe('http://localhost:8080/v1/data/collector');
      });

      it('should replace the whole base including scheme, host, port and path prefix', async () => {
        const request = await requestFor(
          { dataCollectorBaseURL: 'https://collector.example.com:8443/telemetry' },
          'https://collector.example.com:8443/telemetry/v1/data/collector',
        );

        expect(request?.url).toBe('https://collector.example.com:8443/telemetry/v1/data/collector');
      });

      it('should apply authentication, custom headers and timeout to the overridden base', async () => {
        const request = await requestFor(
          {
            dataCollectorBaseURL: 'https://collector.example.com',
            apiKey: 'my-api-key',
            headers: { 'X-Api-Gateway-Key': 'gateway-secret' },
          },
          'https://collector.example.com/v1/data/collector',
        );

        // GOFF-CFG-007: moving the base must not quietly drop the credentials that reach it.
        expect(request?.options.headers).toHaveProperty('X-API-Key', 'my-api-key');
        expect(request?.options.headers).toHaveProperty('X-Api-Gateway-Key', 'gateway-secret');
        expect(request?.options.signal).toBeDefined();
      });
    });

    describe('custom headers', () => {
      const COLLECTOR_URL = 'http://localhost:8080/v1/data/collector';

      const headersFor = async (options: Partial<GoFeatureFlagProviderOptions>): Promise<Record<string, string>> => {
        const api = new GoFeatureFlagApi({ ...baseOptions, ...options } as GoFeatureFlagProviderOptions);
        mockFetch.setResponse(COLLECTOR_URL, new MockResponse(200, 'Success'));

        await api.sendEventToDataCollector([], new ExporterMetadata());

        return mockFetch.getLastRequest()?.options.headers as Record<string, string>;
      };

      it('should send a caller-supplied header', async () => {
        const headers = await headersFor({ headers: { 'X-Api-Gateway-Key': 'gateway-secret' } });

        expect(headers['X-Api-Gateway-Key']).toBe('gateway-secret');
      });

      it('should pass a caller X-API-Key through when no apiKey is configured', async () => {
        const headers = await headersFor({ headers: { 'X-API-Key': 'caller' } });

        expect(headers['X-API-Key']).toBe('caller');
      });

      it('should send no authentication header for an empty apiKey', async () => {
        const headers = await headersFor({ apiKey: '' });

        expect(headers).not.toHaveProperty('X-API-Key');
      });
    });

    it('should include content-type header', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponse('http://localhost:8080/v1/data/collector', new MockResponse(200, 'Success'));

      const events: FeatureEvent[] | TrackingEvent[] = [];
      const metadata: ExporterMetadata = new ExporterMetadata();

      await api.sendEventToDataCollector(events, metadata);

      const request = mockFetch.getLastRequest();
      expect(request?.options.headers).toHaveProperty('Content-Type', 'application/json');
    });

    it('should include events and metadata in request body', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponse('http://localhost:8080/v1/data/collector', new MockResponse(200, 'Success'));

      const events: FeatureEvent[] | TrackingEvent[] = [
        {
          kind: 'feature',
          creationDate: 1750406145,
          contextKind: 'user',
          key: 'TEST',
          userKey: '642e135a-1df9-4419-a3d3-3c42e0e67509',
          default: false,
          value: 'toto',
          variation: 'on',
          version: '1.0.0',
          source: 'INPROCESS',
        },
      ];

      const metadata: ExporterMetadata = new ExporterMetadata().add('env', 'production');

      await api.sendEventToDataCollector(events, metadata);

      const request = mockFetch.getLastRequest();
      const body = JSON.parse(request?.options.body as string);
      // The envelope always carries the reserved keys, so the collector can attribute the
      // events to an SDK and a language even when the caller configured no metadata.
      expect(body.meta).toEqual({ env: 'production', provider: 'nodejs', openfeature: true });
      expect(body.events).toHaveLength(1);
      expect(JSON.stringify(body.events)).toBe(JSON.stringify(events));
    });

    it('should handle tracking events', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponse('http://localhost:8080/v1/data/collector', new MockResponse(200, 'Success'));

      const events: FeatureEvent[] | TrackingEvent[] = [
        {
          kind: 'tracking',
          creationDate: 1750406145,
          contextKind: 'user',
          key: 'TEST2',
          userKey: '642e135a-1df9-4419-a3d3-3c42e0e67509',
          trackingEventDetails: {
            action: 'click',
            label: 'button1',
            value: 1,
          },
        },
      ];

      const metadata: ExporterMetadata = new ExporterMetadata().add('env', 'production');

      await api.sendEventToDataCollector(events, metadata);

      const request = mockFetch.getLastRequest();
      const body = JSON.parse(request?.options.body as string);
      expect(body.events).toHaveLength(1);
      expect(body.events[0].kind).toBe('tracking');
      expect(body.events[0].trackingEventDetails).toEqual({
        action: 'click',
        label: 'button1',
        value: 1,
      });
    });

    it('should throw UnauthorizedException on 401 response', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponseByStatus('401', new MockResponse(401, 'Unauthorized'));

      const events: FeatureEvent[] | TrackingEvent[] = [];
      const metadata: ExporterMetadata = new ExporterMetadata();

      await expect(api.sendEventToDataCollector(events, metadata)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException on 403 response', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponseByStatus('403', new MockResponse(403, 'Forbidden'));

      const events: FeatureEvent[] | TrackingEvent[] = [];
      const metadata: ExporterMetadata = new ExporterMetadata();

      await expect(api.sendEventToDataCollector(events, metadata)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ImpossibleToSendDataToTheCollectorException on 400 response', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponseByStatus('400', new MockResponse(400, 'Bad Request'));

      const events: FeatureEvent[] | TrackingEvent[] = [];
      const metadata: ExporterMetadata = new ExporterMetadata();

      await expect(api.sendEventToDataCollector(events, metadata)).rejects.toThrow(
        ImpossibleToSendDataToTheCollectorException,
      );
    });

    it('should throw ImpossibleToSendDataToTheCollectorException on 500 response', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponseByStatus('500', new MockResponse(500, 'Internal Server Error'));

      const events: FeatureEvent[] | TrackingEvent[] = [];
      const metadata: ExporterMetadata = new ExporterMetadata();

      await expect(api.sendEventToDataCollector(events, metadata)).rejects.toThrow(
        ImpossibleToSendDataToTheCollectorException,
      );
    });

    it('should handle network errors', async () => {
      const mockFetchWithError = async () => {
        throw new Error('Network error');
      };

      const optionsWithErrorFetch: GoFeatureFlagProviderOptions = {
        ...baseOptions,
        fetchImplementation: mockFetchWithError,
      };
      const apiWithError = new GoFeatureFlagApi(optionsWithErrorFetch);

      const events: FeatureEvent[] | TrackingEvent[] = [];
      const metadata: ExporterMetadata = new ExporterMetadata();

      await expect(apiWithError.sendEventToDataCollector(events, metadata)).rejects.toThrow(
        ImpossibleToSendDataToTheCollectorException,
      );
    });

    it('should handle timeout', async () => {
      const mockFetchWithDelay = async (url: string, options: RequestInit = {}) => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (options.signal && (options.signal as AbortSignal).aborted) {
          throw new Error('Request aborted');
        }
        return new MockResponse(200, 'Success');
      };

      const optionsWithDelayFetch: GoFeatureFlagProviderOptions = {
        ...baseOptions,
        fetchImplementation: mockFetchWithDelay as unknown as FetchAPI,
        timeout: 1,
      };
      const apiWithDelay = new GoFeatureFlagApi(optionsWithDelayFetch);

      const events: FeatureEvent[] | TrackingEvent[] = [];
      const metadata: ExporterMetadata = new ExporterMetadata();

      await expect(apiWithDelay.sendEventToDataCollector(events, metadata)).rejects.toThrow(
        ImpossibleToSendDataToTheCollectorException,
      );
    });
  });
});

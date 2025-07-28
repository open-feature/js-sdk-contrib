import { GoFeatureFlagApi } from './api';
import type { GoFeatureFlagProviderOptions } from '../go-feature-flag-provider-options';
import type { FetchAPI } from '../helper/fetch-api';
import { ExporterMetadata, type FeatureEvent, type TrackingEvent } from '../model';
import {
  FlagConfigurationEndpointNotFoundException,
  ImpossibleToRetrieveConfigurationException,
  UnauthorizedException,
  ImpossibleToSendDataToTheCollectorException,
  InvalidOptionsException,
} from '../exception';

// Mock Response class
class MockResponse {
  public status: number;
  public headers: Headers;
  public body: string;
  public ok: boolean;

  constructor(status: number, body = '', headers: Record<string, string> = {}) {
    this.status = status;
    this.body = body;
    this.headers = new Headers(headers);
    this.ok = status >= 200 && status < 300;
  }

  async text(): Promise<string> {
    return this.body;
  }

  async json(): Promise<any> {
    return JSON.parse(this.body);
  }
}

// Mock fetch implementation
class MockFetch {
  private responses: Map<string, MockResponse> = new Map();
  private lastRequest?: {
    url: string;
    options: RequestInit;
  };

  setResponse(url: string, response: MockResponse): void {
    this.responses.set(url, response);
  }

  setResponseByStatus(status: string, response: MockResponse): void {
    this.responses.set(status, response);
  }

  getLastRequest() {
    return this.lastRequest;
  }

  reset(): void {
    this.responses.clear();
    this.lastRequest = undefined;
  }

  async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    this.lastRequest = { url, options };

    // Handle AbortSignal for timeout tests
    if (options.signal) {
      const signal = options.signal as AbortSignal;
      if (signal.aborted) {
        throw new Error('Request aborted');
      }

      // For timeout tests, we'll simulate a delay and then check if aborted
      if (url.includes('timeout')) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (signal.aborted) {
          throw new Error('Request aborted');
        }
      }
    }

    // Check if we have a specific response for this URL
    if (this.responses.has(url)) {
      return this.responses.get(url)! as unknown as Response;
    }

    // Check if we have a response by status code
    const statusMatch = url.match(/(\d{3})/);
    if (statusMatch && this.responses.has(statusMatch[1])) {
      return this.responses.get(statusMatch[1])! as unknown as Response;
    }

    // Check if we have a response by status code in the responses map
    for (const [key, response] of this.responses.entries()) {
      if (key.match(/^\d{3}$/) && response.status === parseInt(key)) {
        return response as unknown as Response;
      }
    }

    // Default response
    return new MockResponse(200, '{}') as unknown as Response;
  }
}

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

    it('should call the configuration endpoint', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponse('http://localhost:8080/v1/flag/configuration', new MockResponse(200, '{}'));

      await api.retrieveFlagConfiguration();

      const request = mockFetch.getLastRequest();
      expect(request!.url).toBe('http://localhost:8080/v1/flag/configuration');
      expect(request!.options.method).toBe('POST');
      expect(request!.options.body).toBe(JSON.stringify({ flags: [] }));
    });

    it('should include API key in authorization header when provided', async () => {
      const options: GoFeatureFlagProviderOptions = {
        ...baseOptions,
        apiKey: 'my-api-key',
      };
      const api = new GoFeatureFlagApi(options);
      mockFetch.setResponse('http://localhost:8080/v1/flag/configuration', new MockResponse(200, '{}'));

      await api.retrieveFlagConfiguration();

      const request = mockFetch.getLastRequest();
      expect(request!.options.headers).toHaveProperty('Authorization', 'Bearer my-api-key');
    });

    it('should not include authorization header when API key is not provided', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponse('http://localhost:8080/v1/flag/configuration', new MockResponse(200, '{}'));

      await api.retrieveFlagConfiguration();

      const request = mockFetch.getLastRequest();
      expect(request?.options.headers).not.toHaveProperty('Authorization');
    });

    it('should include content-type header', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponse('http://localhost:8080/v1/flag/configuration', new MockResponse(200, '{}'));

      await api.retrieveFlagConfiguration();

      const request = mockFetch.getLastRequest();
      expect(request?.options.headers).toHaveProperty('Content-Type', 'application/json');
    });

    it('should include If-None-Match header when etag is provided', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponse('http://localhost:8080/v1/flag/configuration', new MockResponse(200, '{}'));

      await api.retrieveFlagConfiguration('12345');

      const request = mockFetch.getLastRequest();
      expect(request?.options.headers).toHaveProperty('If-None-Match', '12345');
    });

    it('should include flags in request body when provided', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponse('http://localhost:8080/v1/flag/configuration', new MockResponse(200, '{}'));

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

      const result = await api.retrieveFlagConfiguration();

      expect(result.etag).toBe('"123456789"');
      expect(result.lastUpdated).toEqual(new Date('Wed, 21 Oct 2015 07:28:00 GMT'));
      expect(result.flags).toHaveProperty('TEST');
      expect(result.flags).toHaveProperty('TEST2');
      expect(result.evaluationContextEnrichment).toHaveProperty('env', 'production');
    });

    it('should handle 304 response without flags and context', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponseByStatus(
        '304',
        new MockResponse(304, '', {
          etag: '"123456789"',
          'last-modified': 'Wed, 21 Oct 2015 07:28:00 GMT',
        }),
      );

      const result = await api.retrieveFlagConfiguration();

      expect(result.etag).toBe('"123456789"');
      expect(result.lastUpdated).toEqual(new Date('Wed, 21 Oct 2015 07:28:00 GMT'));
      expect(result.flags).toEqual({});
      expect(result.evaluationContextEnrichment).toEqual({});
    });

    it('should handle invalid last-modified header', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponse(
        'http://localhost:8080/v1/flag/configuration',
        new MockResponse(200, '{}', {
          etag: '"123456789"',
          'last-modified': 'invalid-date',
        }),
      );

      const result = await api.retrieveFlagConfiguration();

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
        return new MockResponse(200, '{}');
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

    it('should include API key in authorization header when provided', async () => {
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
      expect(request?.options.headers).toHaveProperty('Authorization', 'Bearer my-api-key');
    });

    it('should not include authorization header when API key is not provided', async () => {
      const api = new GoFeatureFlagApi(baseOptions);
      mockFetch.setResponse('http://localhost:8080/v1/data/collector', new MockResponse(200, 'Success'));

      const events: FeatureEvent[] | TrackingEvent[] = [];
      const metadata: ExporterMetadata = new ExporterMetadata();

      await api.sendEventToDataCollector(events, metadata);

      const request = mockFetch.getLastRequest();
      expect(request?.options.headers).not.toHaveProperty('Authorization');
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
        },
      ];

      const metadata: ExporterMetadata = new ExporterMetadata().add('env', 'production');

      await api.sendEventToDataCollector(events, metadata);

      const request = mockFetch.getLastRequest();
      const body = JSON.parse(request?.options.body as string);
      expect(body.meta).toEqual({ env: 'production' });
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

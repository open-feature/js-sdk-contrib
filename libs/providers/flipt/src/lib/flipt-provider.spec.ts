import fetchMock from 'fetch-mock-jest';
import { TypeMismatchError } from '@openfeature/server-sdk';
import { FliptProvider } from './flipt-provider';

describe('FliptProvider', () => {
  const endpoint = 'http://localhost:8080';
  const variantEndpoint = `${endpoint}/evaluate/v1/variant`;
  const booleanEndpoint = `${endpoint}/evaluate/v1/boolean`;

  let provider: FliptProvider;

  beforeEach(() => {
    fetchMock.mockClear();
    fetchMock.mockReset();
  });

  beforeAll(async () => {
    provider = new FliptProvider('default', { url: 'http://localhost:8080' });

    await provider.initialize();
  });

  describe('initialization with custom headers', () => {
    it('should pass custom headers to FliptClient during initialization', async () => {
      const customHeaders = { 'X-Custom-Header': 'custom-value', 'X-Flipt-Environment': 'abcd' };
      const customProvider = new FliptProvider('default', {
        url: 'http://localhost:8080',
        headers: customHeaders,
      });

      await customProvider.initialize();

      // Mock the endpoint and verify headers are sent in the request
      fetchMock.post(
        `${endpoint}/evaluate/v1/boolean`,
        {
          enabled: true,
          reason: 'MATCH_EVALUATION_REASON',
          requestId: 'test-id',
          requestDurationMillis: 0.5,
          timestamp: '2024-01-15T19:06:33.721025Z',
          flagKey: 'test_flag',
        },
        { overwriteRoutes: true },
      );

      await customProvider.resolveBooleanEvaluation('test_flag', false, { targetingKey: 'user123' });

      // Verify the request was made with the custom headers
      const lastCall = fetchMock.lastCall();
      expect(lastCall).toBeDefined();
      const requestOptions = lastCall?.[1];
      expect(requestOptions?.headers).toEqual(expect.objectContaining(customHeaders));
    });

    it('should initialize provider without headers', async () => {
      const noHeaderProvider = new FliptProvider('default', {
        url: 'http://localhost:8080',
      });

      await noHeaderProvider.initialize();
    });
  });

  describe('method resolveStringEvaluation', () => {
    it('should return default value for missing value', async () => {
      fetchMock.post(
        variantEndpoint,
        {
          code: 5,
          message: 'flag "default/nonExistent" not found',
          details: [],
        },
        { overwriteRoutes: true },
      );

      const value = await provider.resolveStringEvaluation('nonExistent', 'default', { fizz: 'buzz' });
      expect(value).toHaveProperty('value', 'default');
    });

    it('should return right value if key exists', async () => {
      fetchMock.post(
        variantEndpoint,
        {
          match: true,
          segmentKeys: ['segment1'],
          reason: 'MATCH_EVALUATION_REASON',
          variantKey: 'variant1',
          variantAttachment: '',
          requestId: '0f39483c-d52b-42b4-adbb-40b98bc7058d',
          requestDurationMillis: 0.409,
          timestamp: '2024-01-15T18:51:50.629551Z',
          flagKey: 'flag_string',
        },
        { overwriteRoutes: true },
      );

      const value = await provider.resolveStringEvaluation('flag_string', 'default', { fizz: 'buzz' });
      expect(value).toHaveProperty('value', 'variant1');
    });
  });

  describe('method resolveBooleanEvaluation', () => {
    it('should return default value for disabled flag', async () => {
      fetchMock.post(
        booleanEndpoint,
        {
          enabled: false,
          reason: 'DEFAULT_EVALUATION_REASON',
          requestId: 'c5095aa6-df52-4141-8783-87f3cbcaf985',
          requestDurationMillis: 0.477,
          timestamp: '2024-01-15T19:06:33.721025Z',
          flagKey: 'flag_boolean',
        },
        { overwriteRoutes: true },
      );

      const value = await provider.resolveBooleanEvaluation('flag_boolean_disabled', true, { fizz: 'buzz' });
      expect(value).toHaveProperty('value', false);
    });

    it('should return right value if key exists', async () => {
      fetchMock.post(
        booleanEndpoint,
        {
          enabled: true,
          reason: 'MATCH_EVALUATION_REASON',
          requestId: 'c5095aa6-df52-4141-8783-87f3cbcaf985',
          requestDurationMillis: 0.477,
          timestamp: '2024-01-15T19:06:33.721025Z',
          flagKey: 'flag_boolean',
        },
        { overwriteRoutes: true },
      );

      const value = await provider.resolveBooleanEvaluation('flag_boolean', true, { fizz: 'buzz' });
      expect(value).toHaveProperty('value', true);
    });
  });

  describe('method resolveNumberEvaluation', () => {
    it('should return default value for missing value', async () => {
      fetchMock.post(
        variantEndpoint,
        {
          code: 5,
          message: 'flag "default/nonExistent" not found',
          details: [],
        },
        { overwriteRoutes: true },
      );

      const value = await provider.resolveNumberEvaluation('nonExistent', 0, { fizz: 'buzz' });
      expect(value).toHaveProperty('value', 0);
    });

    it('should return right value if key exists', async () => {
      fetchMock.post(
        variantEndpoint,
        {
          match: true,
          segmentKeys: ['segment1'],
          reason: 'MATCH_EVALUATION_REASON',
          variantKey: '10',
          variantAttachment: '',
          requestId: '0f39483c-d52b-42b4-adbb-40b98bc7058d',
          requestDurationMillis: 0.409,
          timestamp: '2024-01-15T18:51:50.629551Z',
          flagKey: 'flag_number',
        },
        { overwriteRoutes: true },
      );

      const value = await provider.resolveNumberEvaluation('flag_number', 0, { fizz: 'buzz' });
      expect(value).toHaveProperty('value', 10);
    });

    it('should throw TypeMismatchError on non-number value', async () => {
      fetchMock.post(
        variantEndpoint,
        {
          match: true,
          segmentKeys: ['segment1'],
          reason: 'MATCH_EVALUATION_REASON',
          variantKey: 'hello',
          variantAttachment: '',
          requestId: '0f39483c-d52b-42b4-adbb-40b98bc7058d',
          requestDurationMillis: 0.409,
          timestamp: '2024-01-15T18:51:50.629551Z',
          flagKey: 'flag_string',
        },
        { overwriteRoutes: true },
      );

      await expect(provider.resolveNumberEvaluation('flag_string', 0, { fizz: 'buzz' })).rejects.toThrow(
        TypeMismatchError,
      );
    });
  });

  describe('method resolveObjectEvaluation', () => {
    it('should return default value for missing value', async () => {
      fetchMock.post(
        variantEndpoint,
        {
          code: 5,
          message: 'flag "default/nonExistent" not found',
          details: [],
        },
        { overwriteRoutes: true },
      );

      const value = await provider.resolveObjectEvaluation('nonExistent', {}, { fizz: 'buzz' });
      expect(value).toHaveProperty('value', {});
    });

    it('should return right value if key exists', async () => {
      fetchMock.post(
        variantEndpoint,
        {
          match: true,
          segmentKeys: ['segment1'],
          reason: 'MATCH_EVALUATION_REASON',
          variantKey: '10',
          variantAttachment: `{"hello": "world"}`,
          requestId: '0f39483c-d52b-42b4-adbb-40b98bc7058d',
          requestDurationMillis: 0.409,
          timestamp: '2024-01-15T18:51:50.629551Z',
          flagKey: 'flag_json',
        },
        { overwriteRoutes: true },
      );

      const value = await provider.resolveObjectEvaluation('flag_json', {}, { fizz: 'buzz' });
      expect(value).toHaveProperty('value', { hello: 'world' });
    });

    it('should return right value for default value', async () => {
      fetchMock.post(
        variantEndpoint,
        {
          match: false,
          segmentKeys: [],
          reason: 'DEFAULT_EVALUATION_REASON',
          variantKey: '10',
          variantAttachment: `{"hello": "world"}`,
          requestId: '0f39483c-d52b-42b4-adbb-40b98bc7058d',
          requestDurationMillis: 0.409,
          timestamp: '2024-01-15T18:51:50.629551Z',
          flagKey: 'flag_json',
        },
        { overwriteRoutes: true },
      );

      const value = await provider.resolveObjectEvaluation('flag_json', {}, { fizz: 'buzz' });
      expect(value).toHaveProperty('value', { hello: 'world' });
    });

    it('should throw TypeMismatchError on non-number value', async () => {
      fetchMock.post(
        variantEndpoint,
        {
          match: true,
          segmentKeys: ['segment1'],
          reason: 'MATCH_EVALUATION_REASON',
          variantKey: 'hello',
          variantAttachment: 'hello',
          requestId: '0f39483c-d52b-42b4-adbb-40b98bc7058d',
          requestDurationMillis: 0.409,
          timestamp: '2024-01-15T18:51:50.629551Z',
          flagKey: 'flag_string',
        },
        { overwriteRoutes: true },
      );

      await expect(provider.resolveObjectEvaluation('flag_string', {}, { fizz: 'buzz' })).rejects.toThrow(
        TypeMismatchError,
      );
    });
  });
});

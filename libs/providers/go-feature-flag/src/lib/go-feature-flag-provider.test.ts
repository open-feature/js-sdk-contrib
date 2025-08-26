import { ErrorCode, OpenFeature, ServerProviderEvents } from '@openfeature/server-sdk';
import { GoFeatureFlagProvider } from './go-feature-flag-provider';
import fetchMock from 'jest-fetch-mock';
import * as fs from 'fs';
import * as path from 'path';
import { HTTP_HEADER_LAST_MODIFIED } from './helper/constants';
import { EvaluationType } from './model';
import {
  FlagConfigurationEndpointNotFoundException,
  InvalidOptionsException,
  UnauthorizedException,
} from './exception';

const DefaultEvaluationContext = {
  targetingKey: 'd45e303a-38c2-11ed-a261-0242ac120002',
  email: 'john.doe@gofeatureflag.org',
  firstname: 'john',
  lastname: 'doe',
  anonymous: false,
  professional: true,
  rate: 3.14,
  age: 30,
  company_info: {
    name: 'my_company',
    size: 120,
  },
  labels: ['pro', 'beta'],
};

describe('GoFeatureFlagProvider', () => {
  let testClientName = '';
  beforeEach(async () => {
    testClientName = expect.getState().currentTestName ?? 'my-test';
    await OpenFeature.close();
    jest.useFakeTimers();
    fetchMock.enableMocks();
  });

  afterEach(async () => {
    testClientName = '';
    jest.clearAllMocks();
    jest.useRealTimers();
    fetchMock.resetMocks();

    // Clean up OpenFeature
    await OpenFeature.close();
  });

  describe('Constructor', () => {
    it('should validate metadata name', () => {
      const provider = new GoFeatureFlagProvider({
        endpoint: 'https://gofeatureflag.org',
        evaluationType: EvaluationType.Remote,
      });
      expect(provider.metadata.name).toBe('GoFeatureFlagProvider');
    });

    it('should throw InvalidOptionsException when options is null', () => {
      expect(() => new GoFeatureFlagProvider(null as any)).toThrow(InvalidOptionsException);
      expect(() => new GoFeatureFlagProvider(null as any)).toThrow('No options provided');
    });

    it('should throw InvalidOptionsException when options is undefined', () => {
      expect(() => new GoFeatureFlagProvider(undefined as any)).toThrow(InvalidOptionsException);
      expect(() => new GoFeatureFlagProvider(undefined as any)).toThrow('No options provided');
    });

    it('should throw InvalidOptionsException when endpoint is null', () => {
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: null as any,
          }),
      ).toThrow(InvalidOptionsException);
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: null as any,
          }),
      ).toThrow('endpoint is a mandatory field when initializing the provider');
    });

    it('should throw InvalidOptionsException when endpoint is undefined', () => {
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: undefined as any,
          }),
      ).toThrow(InvalidOptionsException);
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: undefined as any,
          }),
      ).toThrow('endpoint is a mandatory field when initializing the provider');
    });

    it('should throw InvalidOptionsException when endpoint is empty string', () => {
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: '',
          }),
      ).toThrow(InvalidOptionsException);
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: '',
          }),
      ).toThrow('endpoint is a mandatory field when initializing the provider');
    });

    it('should throw InvalidOptionsException when endpoint is whitespace only', () => {
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: '   ',
          }),
      ).toThrow(InvalidOptionsException);
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: '   ',
          }),
      ).toThrow('endpoint is a mandatory field when initializing the provider');
    });

    it('should throw InvalidOptionsException when endpoint is not a valid URL', () => {
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: 'not-a-url',
          }),
      ).toThrow(InvalidOptionsException);
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: 'not-a-url',
          }),
      ).toThrow('endpoint must be a valid URL (http or https)');
    });

    it('should throw InvalidOptionsException when endpoint is missing protocol', () => {
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: 'gofeatureflag.org',
          }),
      ).toThrow(InvalidOptionsException);
    });

    it('should throw InvalidOptionsException when endpoint has invalid protocol', () => {
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: 'ftp://gofeatureflag.org',
          }),
      ).toThrow(InvalidOptionsException);
    });

    it('should accept valid HTTP endpoint', () => {
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: 'http://gofeatureflag.org',
          }),
      ).not.toThrow();
    });

    it('should accept valid HTTPS endpoint', () => {
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: 'https://gofeatureflag.org',
          }),
      ).not.toThrow();
    });

    it('should accept valid endpoint with path', () => {
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: 'https://gofeatureflag.org/api/v1',
          }),
      ).not.toThrow();
    });

    it('should accept valid endpoint with port', () => {
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: 'https://gofeatureflag.org:8080',
          }),
      ).not.toThrow();
    });

    it('should throw InvalidOptionsException when flagChangePollingIntervalMs is zero', () => {
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: 'https://gofeatureflag.org',
            flagChangePollingIntervalMs: 0,
          }),
      ).toThrow(InvalidOptionsException);
    });

    it('should throw InvalidOptionsException when flagChangePollingIntervalMs is negative', () => {
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: 'https://gofeatureflag.org',
            flagChangePollingIntervalMs: -1000,
          }),
      ).toThrow(InvalidOptionsException);
    });

    it('should accept valid flagChangePollingIntervalMs', () => {
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: 'https://gofeatureflag.org',
            flagChangePollingIntervalMs: 30000,
          }),
      ).not.toThrow();
    });

    it('should throw InvalidOptionsException when timeout is zero', () => {
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: 'https://gofeatureflag.org',
            timeout: 0,
          }),
      ).toThrow(InvalidOptionsException);
    });

    it('should throw InvalidOptionsException when timeout is negative', () => {
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: 'https://gofeatureflag.org',
            timeout: -5000,
          }),
      ).toThrow(InvalidOptionsException);
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: 'https://gofeatureflag.org',
            timeout: -5000,
          }),
      ).toThrow('timeout must be greater than zero');
    });

    it('should throw InvalidOptionsException when dataFlushInterval is zero', () => {
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: 'https://gofeatureflag.org',
            dataFlushInterval: 0,
          }),
      ).toThrow(InvalidOptionsException);
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: 'https://gofeatureflag.org',
            dataFlushInterval: 0,
          }),
      ).toThrow('dataFlushInterval must be greater than zero');
    });

    it('should throw InvalidOptionsException when dataFlushInterval is negative', () => {
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: 'https://gofeatureflag.org',
            dataFlushInterval: -1000,
          }),
      ).toThrow(InvalidOptionsException);
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: 'https://gofeatureflag.org',
            dataFlushInterval: -1000,
          }),
      ).toThrow('dataFlushInterval must be greater than zero');
    });

    it('should accept valid dataFlushInterval', () => {
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: 'https://gofeatureflag.org',
            dataFlushInterval: 1000,
          }),
      ).not.toThrow();
    });

    it('should throw InvalidOptionsException when maxPendingEvents is zero', () => {
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: 'https://gofeatureflag.org',
            maxPendingEvents: 0,
          }),
      ).toThrow(InvalidOptionsException);
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: 'https://gofeatureflag.org',
            maxPendingEvents: 0,
          }),
      ).toThrow('maxPendingEvents must be greater than zero');
    });

    it('should throw InvalidOptionsException when maxPendingEvents is negative', () => {
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: 'https://gofeatureflag.org',
            maxPendingEvents: -100,
          }),
      ).toThrow(InvalidOptionsException);
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: 'https://gofeatureflag.org',
            maxPendingEvents: -100,
          }),
      ).toThrow('maxPendingEvents must be greater than zero');
    });

    it('should accept valid maxPendingEvents', () => {
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: 'https://gofeatureflag.org',
            maxPendingEvents: 10000,
          }),
      ).not.toThrow();
    });

    it('should accept provider with all optional fields set to valid values', () => {
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: 'https://gofeatureflag.org',
            evaluationType: EvaluationType.InProcess,
            timeout: 15000,
            flagChangePollingIntervalMs: 60000,
            dataFlushInterval: 2000,
            maxPendingEvents: 5000,
            disableDataCollection: true,
            apiKey: 'test-api-key',
          }),
      ).not.toThrow();
    });

    it('should accept provider with minimal required options', () => {
      expect(
        () =>
          new GoFeatureFlagProvider({
            endpoint: 'https://gofeatureflag.org',
          }),
      ).not.toThrow();
    });
  });

  describe('Basic Provider Functionality', () => {
    it('should handle track method calls', () => {
      const provider = new GoFeatureFlagProvider({
        endpoint: 'https://gofeatureflag.org',
        evaluationType: EvaluationType.Remote,
      });

      expect(() => {
        provider.track('test-event', { targetingKey: 'test-user' });
      }).not.toThrow();
    });

    it('should handle evaluation context with various data types', () => {
      const provider = new GoFeatureFlagProvider({
        endpoint: 'https://gofeatureflag.org',
        evaluationType: EvaluationType.Remote,
      });

      const complexContext = {
        targetingKey: 'user123',
        stringValue: 'test',
        numberValue: 42,
        booleanValue: true,
        objectValue: { key: 'value' },
        arrayValue: [1, 2, 3],
      };

      expect(() => {
        provider.track('test-event', complexContext);
      }).not.toThrow();
    });
  });

  describe('Remote Evaluation', () => {
    it('should evaluate a string flag with remote evaluation', async () => {
      fetchMock.mockResponseOnce(
        JSON.stringify({
          value: 'CC0000',
          key: 'string_key',
          reason: 'TARGETING_MATCH',
          variant: 'color1',
          metadata: {
            team: 'ecommerce',
            businessPurpose: 'experiment',
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );

      const provider = new GoFeatureFlagProvider({
        endpoint: 'http://localhost:1031',
        evaluationType: EvaluationType.Remote,
      });

      await OpenFeature.setProviderAndWait(testClientName, provider);
      const client = OpenFeature.getClient(testClientName);
      const result = await client.getStringDetails('string_key', 'default', DefaultEvaluationContext);

      const want = {
        value: 'CC0000',
        reason: 'TARGETING_MATCH',
        flagKey: 'string_key',
        variant: 'color1',
        flagMetadata: {
          team: 'ecommerce',
          businessPurpose: 'experiment',
        },
      };
      expect(result).toEqual(want);
    });

    it('should evaluate a boolean flag with remote evaluation', async () => {
      fetchMock.mockResponseOnce(
        JSON.stringify({
          value: true,
          key: 'bool_key',
          reason: 'STATIC',
          variant: 'enabled',
          metadata: {
            team: 'ecommerce',
            businessPurpose: 'experiment',
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );

      const provider = new GoFeatureFlagProvider({
        endpoint: 'http://localhost:1031',
        evaluationType: EvaluationType.Remote,
      });

      await OpenFeature.setProviderAndWait(testClientName, provider);
      const client = OpenFeature.getClient(testClientName);
      const result = await client.getBooleanDetails('bool_key', false, DefaultEvaluationContext);

      const want = {
        value: true,
        reason: 'STATIC',
        flagKey: 'bool_key',
        variant: 'enabled',
        flagMetadata: {
          team: 'ecommerce',
          businessPurpose: 'experiment',
        },
      };
      expect(result).toEqual(want);
    });

    it('should evaluate a double flag with remote evaluation', async () => {
      fetchMock.mockResponseOnce(
        JSON.stringify({
          value: 1.4,
          key: 'double_key',
          reason: 'STATIC',
          variant: 'value1',
          metadata: {
            team: 'ecommerce',
            businessPurpose: 'experiment',
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );

      const provider = new GoFeatureFlagProvider({
        endpoint: 'http://localhost:1031',
        evaluationType: EvaluationType.Remote,
      });

      await OpenFeature.setProviderAndWait(testClientName, provider);
      const client = OpenFeature.getClient(testClientName);
      const result = await client.getNumberDetails('double_key', 1.11, DefaultEvaluationContext);

      const want = {
        value: 1.4,
        reason: 'STATIC',
        flagKey: 'double_key',
        variant: 'value1',
        flagMetadata: {
          team: 'ecommerce',
          businessPurpose: 'experiment',
        },
      };
      expect(result).toEqual(want);
    });

    it('should evaluate an int flag with remote evaluation', async () => {
      fetchMock.mockResponseOnce(
        JSON.stringify({
          value: 1,
          key: 'int_key',
          reason: 'STATIC',
          variant: 'value2',
          metadata: {
            team: 'ecommerce',
            businessPurpose: 'experiment',
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );

      const provider = new GoFeatureFlagProvider({
        endpoint: 'http://localhost:1031',
        evaluationType: EvaluationType.Remote,
      });

      await OpenFeature.setProviderAndWait(testClientName, provider);
      const client = OpenFeature.getClient(testClientName);
      const result = await client.getNumberDetails('int_key', 1, DefaultEvaluationContext);

      const want = {
        value: 1,
        reason: 'STATIC',
        flagKey: 'int_key',
        variant: 'value2',
        flagMetadata: {
          team: 'ecommerce',
          businessPurpose: 'experiment',
        },
      };
      expect(result).toEqual(want);
    });

    it('should evaluate an object flag with remote evaluation', async () => {
      fetchMock.mockResponseOnce(
        JSON.stringify({
          value: {
            name: 'gofeatureflag',
            size: 150,
          },
          key: 'object_key',
          reason: 'STATIC',
          variant: 'value3',
          metadata: {
            team: 'ecommerce',
            businessPurpose: 'experiment',
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );

      const provider = new GoFeatureFlagProvider({
        endpoint: 'http://localhost:1031',
        evaluationType: EvaluationType.Remote,
      });

      await OpenFeature.setProviderAndWait(testClientName, provider);
      const client = OpenFeature.getClient(testClientName);
      const result = await client.getObjectDetails(
        'object_key',
        {
          name: 'my_company',
          size: 120,
        },
        DefaultEvaluationContext,
      );

      const want = {
        value: {
          name: 'gofeatureflag',
          size: 150,
        },
        reason: 'STATIC',
        flagKey: 'object_key',
        variant: 'value3',
        flagMetadata: {
          team: 'ecommerce',
          businessPurpose: 'experiment',
        },
      };
      expect(result).toEqual(want);
    });

    it('should error if flag is not found', async () => {
      fetchMock.mockResponseOnce(
        JSON.stringify({
          key: 'not_found_key',
          errorCode: ErrorCode.FLAG_NOT_FOUND,
          errorMessage: 'flag not found',
          flagMetadata: {
            team: 'ecommerce',
            businessPurpose: 'experiment',
          },
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        },
      );

      const provider = new GoFeatureFlagProvider({
        endpoint: 'http://localhost:1031',
        evaluationType: EvaluationType.Remote,
      });

      await OpenFeature.setProviderAndWait(testClientName, provider);
      const client = OpenFeature.getClient(testClientName);
      const result = await client.getNumberDetails('not_found_key', 1, DefaultEvaluationContext);

      const want = {
        value: 1,
        reason: 'ERROR',
        errorCode: ErrorCode.FLAG_NOT_FOUND,
        errorMessage: ErrorCode.FLAG_NOT_FOUND,
        flagKey: 'not_found_key',
        flagMetadata: {},
      };
      expect(result).toEqual(want);
    });

    it('should error if flag type mismatch', async () => {
      fetchMock.mockResponseOnce(
        JSON.stringify({
          key: 'type_mismatch_key',
          errorCode: ErrorCode.TYPE_MISMATCH,
          errorMessage: 'type mismatch',
          flagMetadata: {
            team: 'ecommerce',
            businessPurpose: 'experiment',
          },
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );

      const provider = new GoFeatureFlagProvider({
        endpoint: 'http://localhost:1031',
        evaluationType: EvaluationType.Remote,
      });

      await OpenFeature.setProviderAndWait(testClientName, provider);
      const client = OpenFeature.getClient(testClientName);
      const result = await client.getNumberDetails('type_mismatch_key', 1, DefaultEvaluationContext);

      const want = {
        value: 1,
        reason: 'ERROR',
        errorCode: ErrorCode.TYPE_MISMATCH,
        errorMessage: ErrorCode.TYPE_MISMATCH,
        flagKey: 'type_mismatch_key',
        flagMetadata: {},
      };
      expect(result).toEqual(want);
    });
  });

  describe('InProcess Evaluation', () => {
    it('should evaluate a string flag with inprocess evaluation', async () => {
      fetchMock.mockResponseOnce(getConfigurationEndpointResult(), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      const provider = new GoFeatureFlagProvider({
        endpoint: 'http://localhost:1031',
      });

      await OpenFeature.setProviderAndWait(testClientName, provider);
      const client = OpenFeature.getClient(testClientName);
      const result = await client.getStringDetails('string_key', 'default', DefaultEvaluationContext);
      const want = {
        reason: 'TARGETING_MATCH',
        flagKey: 'string_key',
        value: 'CC0000',
        flagMetadata: {
          description: 'this is a test',
          pr_link: 'https://github.com/thomaspoignant/go-feature-flag/pull/916',
        },
        variant: 'True',
      };
      expect(result).toEqual(want);
    });

    it('should evaluate a boolean flag with inprocess evaluation', async () => {
      fetchMock.mockResponseOnce(getConfigurationEndpointResult(), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      const provider = new GoFeatureFlagProvider({
        endpoint: 'http://localhost:1031',
      });

      await OpenFeature.setProviderAndWait(testClientName, provider);
      const client = OpenFeature.getClient(testClientName);
      const result = await client.getBooleanDetails('bool_targeting_match', false, DefaultEvaluationContext);
      const want = {
        reason: 'TARGETING_MATCH',
        flagKey: 'bool_targeting_match',
        value: true,
        flagMetadata: {
          description: 'this is a test',
          pr_link: 'https://github.com/thomaspoignant/go-feature-flag/pull/916',
        },
        variant: 'True',
      };
      expect(result).toEqual(want);
    });

    it('should evaluate an int flag with inprocess evaluation', async () => {
      fetchMock.mockResponseOnce(getConfigurationEndpointResult(), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      const provider = new GoFeatureFlagProvider({
        endpoint: 'http://localhost:1031',
      });

      await OpenFeature.setProviderAndWait(testClientName, provider);
      const client = OpenFeature.getClient(testClientName);
      const result = await client.getNumberDetails('integer_key', 1, DefaultEvaluationContext);
      const want = {
        reason: 'TARGETING_MATCH',
        flagKey: 'integer_key',
        value: 100,
        flagMetadata: {
          description: 'this is a test',
          pr_link: 'https://github.com/thomaspoignant/go-feature-flag/pull/916',
        },
        variant: 'True',
      };
      expect(result).toEqual(want);
    });

    it('should evaluate a double flag with inprocess evaluation', async () => {
      fetchMock.mockResponseOnce(getConfigurationEndpointResult(), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      const provider = new GoFeatureFlagProvider({
        endpoint: 'http://localhost:1031',
      });

      await OpenFeature.setProviderAndWait(testClientName, provider);
      const client = OpenFeature.getClient(testClientName);
      const result = await client.getNumberDetails('double_key', 1, DefaultEvaluationContext);
      const want = {
        reason: 'TARGETING_MATCH',
        flagKey: 'double_key',
        value: 100.25,
        flagMetadata: {
          description: 'this is a test',
          pr_link: 'https://github.com/thomaspoignant/go-feature-flag/pull/916',
        },
        variant: 'True',
      };
      expect(result).toEqual(want);
    });

    it('should evaluate an object flag with inprocess evaluation', async () => {
      fetchMock.mockResponseOnce(getConfigurationEndpointResult(), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      const provider = new GoFeatureFlagProvider({
        endpoint: 'http://localhost:1031',
      });

      await OpenFeature.setProviderAndWait(testClientName, provider);
      const client = OpenFeature.getClient(testClientName);
      const result = await client.getObjectDetails(
        'object_key',
        {
          default: true,
        },
        DefaultEvaluationContext,
      );
      const want = {
        reason: 'TARGETING_MATCH',
        flagKey: 'object_key',
        value: {
          test: 'test1',
          test2: false,
          test3: 123.3,
          test4: 1,
        },
        flagMetadata: {
          description: 'this is a test',
          pr_link: 'https://github.com/thomaspoignant/go-feature-flag/pull/916',
        },
        variant: 'True',
      };
      expect(result).toEqual(want);
    });

    it('should evaluate an array flag with inprocess evaluation', async () => {
      fetchMock.mockResponseOnce(getConfigurationEndpointResult(), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      const provider = new GoFeatureFlagProvider({
        endpoint: 'http://localhost:1031',
      });

      await OpenFeature.setProviderAndWait(testClientName, provider);
      const client = OpenFeature.getClient(testClientName);
      const result = await client.getObjectDetails('list_key', ['default', 'true'], DefaultEvaluationContext);
      const want = {
        reason: 'TARGETING_MATCH',
        flagKey: 'list_key',
        value: ['true'],
        flagMetadata: {
          description: 'this is a test',
          pr_link: 'https://github.com/thomaspoignant/go-feature-flag/pull/916',
        },
        variant: 'True',
      };
      expect(result).toEqual(want);
    });

    it('should error FLAG_NOT_FOUND when flag is not found', async () => {
      fetchMock.mockResponseOnce(getConfigurationEndpointResult(), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      const provider = new GoFeatureFlagProvider({
        endpoint: 'http://localhost:1031',
      });

      await OpenFeature.setProviderAndWait(testClientName, provider);
      const client = OpenFeature.getClient(testClientName);
      const result = await client.getObjectDetails('flag_not_found', ['default', 'true'], DefaultEvaluationContext);
      const want = {
        reason: 'ERROR',
        flagKey: 'flag_not_found',
        value: ['default', 'true'],
        errorCode: ErrorCode.FLAG_NOT_FOUND,
        // eslint-disable-next-line quotes
        errorMessage: "Flag with key 'flag_not_found' not found",
        flagMetadata: {},
      };
      expect(result).toEqual(want);
    });

    it('Should error if we expect a boolean and got another type', async () => {
      fetchMock.mockResponseOnce(getConfigurationEndpointResult(), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      const provider = new GoFeatureFlagProvider({
        endpoint: 'http://localhost:1031',
      });

      await OpenFeature.setProviderAndWait(testClientName, provider);
      const client = OpenFeature.getClient(testClientName);
      const result = await client.getStringDetails('double_key', 'default', DefaultEvaluationContext);
      const want = {
        reason: 'ERROR',
        flagKey: 'double_key',
        value: 'default',
        errorCode: ErrorCode.TYPE_MISMATCH,
        errorMessage: 'Flag double_key had unexpected type, expected string.',
        flagMetadata: {},
      };
      expect(result).toEqual(want);
    });

    it('Should use boolean default value if the flag is disabled', async () => {
      fetchMock.mockResponseOnce(getConfigurationEndpointResult(), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      const provider = new GoFeatureFlagProvider({
        endpoint: 'http://localhost:1031',
      });

      await OpenFeature.setProviderAndWait(testClientName, provider);
      const client = OpenFeature.getClient(testClientName);
      const result = await client.getBooleanDetails('disabled_bool', false, DefaultEvaluationContext);
      const want = {
        reason: 'DISABLED',
        flagKey: 'disabled_bool',
        value: false,
        flagMetadata: {
          description: 'this is a test',
          pr_link: 'https://github.com/thomaspoignant/go-feature-flag/pull/916',
        },
        variant: 'SdkDefault',
      };
      expect(result).toEqual(want);
    });

    it('Should emit configuration change event, if config has changed', async () => {
      jest.useRealTimers();
      fetchMock.mockResponses(
        [
          getConfigurationEndpointResult(),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ],
        [
          getConfigurationEndpointResult('change-config-before'),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          },
        ],
      );
      const provider = new GoFeatureFlagProvider({
        endpoint: 'http://localhost:1031',
        flagChangePollingIntervalMs: 100,
      });

      let configChangedCount = 0;
      provider.events.addHandler(ServerProviderEvents.ConfigurationChanged, () => {
        configChangedCount++;
      });

      await OpenFeature.setProviderAndWait(testClientName, provider);
      await new Promise((resolve) => setTimeout(resolve, 180));

      expect(configChangedCount).toBeGreaterThan(0);
    });

    it('Should change evaluation details if config has changed', async () => {
      jest.useRealTimers();
      let callCount = 0;
      fetchMock.mockIf(/^http:\/\/localhost:1031/, async () => {
        callCount++;
        if (callCount <= 1) {
          return {
            body: getConfigurationEndpointResult('change-config-before'),
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              ETag: '"1234567890"',
              [HTTP_HEADER_LAST_MODIFIED]: '2021-01-01T00:00:00Z',
            },
          };
        } else {
          return {
            body: getConfigurationEndpointResult('change-config-after'),
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              ETag: '"2345678910"',
              [HTTP_HEADER_LAST_MODIFIED]: '2021-01-02T00:00:00Z',
            },
          };
        }
      });

      const provider = new GoFeatureFlagProvider({
        endpoint: 'http://localhost:1031',
        flagChangePollingIntervalMs: 200,
      });

      await OpenFeature.setProviderAndWait(testClientName, provider);
      const client = OpenFeature.getClient(testClientName);
      const res1 = await client.getBooleanDetails('TEST', false, DefaultEvaluationContext);
      expect(res1.value).toBe(false);
      await new Promise((resolve) => setTimeout(resolve, 250));
      const res2 = await client.getBooleanDetails('TEST', false, DefaultEvaluationContext);
      expect(res2.value).toBe(true);
      expect(res1).not.toEqual(res2);
    });

    it('Should error if flag configuration endpoint return a 404', async () => {
      jest.useRealTimers();
      fetchMock.mockResponseOnce(getConfigurationEndpointResult(), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });

      const provider = new GoFeatureFlagProvider({
        endpoint: 'http://localhost:1031',
        flagChangePollingIntervalMs: 100,
      });
      try {
        await OpenFeature.setProviderAndWait(testClientName, provider);
        expect(true).toBe(false); // if we reach this line, the test should fail
      } catch (error) {
        expect(error).toBeInstanceOf(FlagConfigurationEndpointNotFoundException);
      }
    });

    it('Should error if flag configuration endpoint return a 403', async () => {
      jest.useRealTimers();
      fetchMock.mockResponseOnce(getConfigurationEndpointResult(), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });

      const provider = new GoFeatureFlagProvider({
        endpoint: 'http://localhost:1031',
        flagChangePollingIntervalMs: 100,
      });
      try {
        await OpenFeature.setProviderAndWait(testClientName, provider);
        expect(true).toBe(false); // if we reach this line, the test should fail
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedException);
      }
    });

    it('Should error if flag configuration endpoint return a 401', async () => {
      jest.useRealTimers();
      fetchMock.mockResponseOnce(getConfigurationEndpointResult(), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });

      const provider = new GoFeatureFlagProvider({
        endpoint: 'http://localhost:1031',
        flagChangePollingIntervalMs: 100,
      });
      try {
        await OpenFeature.setProviderAndWait(testClientName, provider);
        expect(true).toBe(false); // if we reach this line, the test should fail
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedException);
      }
    });

    it('Should apply a scheduled rollout step', async () => {
      fetchMock.mockResponseOnce(getConfigurationEndpointResult('scheduled-rollout'), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });

      const provider = new GoFeatureFlagProvider({
        endpoint: 'http://localhost:1031',
        flagChangePollingIntervalMs: 100,
      });

      await OpenFeature.setProviderAndWait(testClientName, provider);
      const client = OpenFeature.getClient(testClientName);

      const got = await client.getBooleanDetails('my-flag', false, DefaultEvaluationContext);
      const want = {
        reason: 'TARGETING_MATCH',
        flagKey: 'my-flag',
        flagMetadata: {
          defaultValue: false,
          description: 'this is a test flag',
        },
        value: true,
        variant: 'enabled',
      };
      expect(got).toEqual(want);
    });

    it('Should not apply a scheduled rollout in the future', async () => {
      jest.setSystemTime(new Date('2021-01-01T00:00:00Z'));
      fetchMock.mockIf(/^http:\/\/localhost:1031\/v1\/flag\/configuration/, async () => {
        return {
          body: getConfigurationEndpointResult('scheduled-rollout'),
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        };
      });

      const provider = new GoFeatureFlagProvider({
        endpoint: 'http://localhost:1031',
        flagChangePollingIntervalMs: 100,
      });

      await OpenFeature.setProviderAndWait(testClientName, provider);
      const client = OpenFeature.getClient(testClientName);

      const got = await client.getBooleanDetails('my-flag-scheduled-in-future', false, DefaultEvaluationContext);
      const want = {
        reason: 'STATIC',
        flagKey: 'my-flag-scheduled-in-future',
        flagMetadata: {
          defaultValue: false,
          description: 'this is a test flag',
        },
        value: false,
        variant: 'disabled',
      };
      expect(got).toEqual(want);
    });
  });

  describe('Track method', () => {
    it('should track events with context and details', async () => {
      jest.setSystemTime(new Date('2021-01-01T00:00:00Z'));
      fetchMock.mockIf(/^http:\/\/localhost:1031\/v1\/data\/collector/, async () => {
        return {
          body: JSON.stringify({}),
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        };
      });

      const provider = new GoFeatureFlagProvider({
        endpoint: 'http://localhost:1031',
        evaluationType: EvaluationType.Remote,
        dataFlushInterval: 100,
        maxPendingEvents: 1,
      });

      await OpenFeature.setProviderAndWait('track-events-with-context-and-details', provider);
      await provider.initialize();
      const client = OpenFeature.getClient('track-events-with-context-and-details');

      client.track(
        'testEvent',
        {
          targetingKey: 'testTargetingKey',
          email: 'test@example.com',
        },
        {
          test: 'testValue',
          metric: 42,
        },
      );

      jest.advanceTimersByTime(100);

      const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
      expect(lastCall).toBeDefined();
      expect(lastCall[0]).toBe('http://localhost:1031/v1/data/collector');

      const want = {
        meta: {},
        events: [
          {
            kind: 'tracking',
            userKey: 'testTargetingKey',
            contextKind: 'user',
            key: 'testEvent',
            trackingEventDetails: {
              test: 'testValue',
              metric: 42,
            },
            creationDate: 1609459200,
            evaluationContext: {
              targetingKey: 'testTargetingKey',
              email: 'test@example.com',
            },
          },
        ],
      };
      expect(lastCall[1]?.body).toBeDefined();
      expect(JSON.parse(lastCall[1]?.body as string)).toEqual(want);
    });

    it('should track events without context', async () => {
      jest.setSystemTime(new Date('2021-01-01T00:00:00Z'));
      fetchMock.mockIf(/^http:\/\/localhost:1031\/v1\/data\/collector/, async () => {
        return {
          body: getConfigurationEndpointResult(),
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        };
      });

      fetchMock.mockIf(/^http:\/\/localhost:1031\/v1\/flag\/configuration/, async () => {
        return {
          body: JSON.stringify({}),
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        };
      });

      const provider = new GoFeatureFlagProvider({
        endpoint: 'http://localhost:1031',
        dataFlushInterval: 100,
        maxPendingEvents: 1,
      });

      await OpenFeature.setProviderAndWait('track-events-without-context', provider);
      const client = OpenFeature.getClient('track-events-without-context');

      client.track('testEventWithoutContext');

      jest.advanceTimersByTime(110);

      const want = {
        meta: {},
        events: [
          {
            kind: 'tracking',
            userKey: 'undefined-targetingKey',
            contextKind: 'user',
            key: 'testEventWithoutContext',
            trackingEventDetails: {},
            creationDate: 1609459200,
            evaluationContext: {},
          },
        ],
      };

      // Find the last call to /v1/data/collector
      const dataCollectorCalls = fetchMock.mock.calls.filter(
        (call) => call[0] === 'http://localhost:1031/v1/data/collector',
      );
      const lastDataCollectorCall = dataCollectorCalls[dataCollectorCalls.length - 1];
      expect(lastDataCollectorCall).toBeDefined();
      expect(lastDataCollectorCall[0]).toBe('http://localhost:1031/v1/data/collector');
      expect(lastDataCollectorCall[1]?.body).toBeDefined();
      expect(JSON.parse(lastDataCollectorCall[1]?.body as string)).toEqual(want);
    });

    it('should track events without tracking details', async () => {
      jest.setSystemTime(new Date('2021-01-01T00:00:00Z'));
      fetchMock.mockIf(/^http:\/\/localhost:1031\/v1\/data\/collector/, async () => {
        return {
          body: JSON.stringify({}),
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        };
      });

      fetchMock.mockIf(/^http:\/\/localhost:1031\/v1\/flag\/configuration/, async () => {
        return {
          body: JSON.stringify({}),
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        };
      });

      const provider = new GoFeatureFlagProvider({
        endpoint: 'http://localhost:1031',
        dataFlushInterval: 100,
        maxPendingEvents: 1,
      });

      await OpenFeature.setProviderAndWait('track-events-without-tracking-details', provider);
      const client = OpenFeature.getClient('track-events-without-tracking-details');

      client.track('testEventNoDetails', {
        targetingKey: 'testTargetingKey',
        userId: '123',
      });

      jest.advanceTimersByTime(150);

      const want = {
        meta: {},
        events: [
          {
            kind: 'tracking',
            userKey: 'testTargetingKey',
            key: 'testEventNoDetails',
            trackingEventDetails: {},
            evaluationContext: {
              targetingKey: 'testTargetingKey',
              userId: '123',
            },
            creationDate: 1609459200,
            contextKind: 'user',
          },
        ],
      };

      // Find the last call to /v1/data/collector
      const dataCollectorCalls = fetchMock.mock.calls.filter(
        (call) => call[0] === 'http://localhost:1031/v1/data/collector',
      );
      const lastDataCollectorCall = dataCollectorCalls[dataCollectorCalls.length - 1];
      expect(lastDataCollectorCall).toBeDefined();
      expect(lastDataCollectorCall[0]).toBe('http://localhost:1031/v1/data/collector');
      expect(lastDataCollectorCall[1]?.body).toBeDefined();
      expect(JSON.parse(lastDataCollectorCall[1]?.body as string)).toEqual(want);
    });

    it('should track multiple events', async () => {
      jest.setSystemTime(new Date('2021-01-01T00:00:00Z'));
      fetchMock.mockIf(/^http:\/\/localhost:1031\/v1\/data\/collector/, async () => {
        return {
          body: JSON.stringify({}),
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        };
      });

      const provider = new GoFeatureFlagProvider({
        endpoint: 'http://localhost:1031',
        evaluationType: EvaluationType.Remote,
        dataFlushInterval: 100,
        maxPendingEvents: 3,
      });

      await OpenFeature.setProviderAndWait('track-events-with-context-and-details', provider);
      await provider.initialize();
      const client = OpenFeature.getClient('track-events-with-context-and-details');

      client.track(
        'testEvent',
        {
          targetingKey: 'testTargetingKey',
          email: 'test@example.com',
        },
        {
          test: 'testValue',
          metric: 42,
        },
      );
      client.track(
        'testEvent',
        {
          targetingKey: 'testTargetingKey',
          email: 'test2@example.com',
        },
        {
          test: 'testValue',
          metric: 43,
        },
      );
      client.track(
        'testEvent',
        {
          targetingKey: 'testTargetingKey3',
          email: 'test3@example.com',
        },
        {
          test: 'testValue',
          metric: 44,
        },
      );

      jest.advanceTimersByTime(100);

      const want = {
        meta: {},
        events: [
          {
            kind: 'tracking',
            userKey: 'testTargetingKey',
            contextKind: 'user',
            key: 'testEvent',
            trackingEventDetails: {
              test: 'testValue',
              metric: 42,
            },
            creationDate: 1609459200,
            evaluationContext: {
              targetingKey: 'testTargetingKey',
              email: 'test@example.com',
            },
          },
          {
            kind: 'tracking',
            userKey: 'testTargetingKey',
            contextKind: 'user',
            key: 'testEvent',
            trackingEventDetails: {
              test: 'testValue',
              metric: 43,
            },
            creationDate: 1609459200,
            evaluationContext: {
              targetingKey: 'testTargetingKey',
              email: 'test2@example.com',
            },
          },
          {
            kind: 'tracking',
            userKey: 'testTargetingKey3',
            contextKind: 'user',
            key: 'testEvent',
            trackingEventDetails: {
              test: 'testValue',
              metric: 44,
            },
            creationDate: 1609459200,
            evaluationContext: {
              targetingKey: 'testTargetingKey3',
              email: 'test3@example.com',
            },
          },
        ],
      };

      const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
      expect(lastCall).toBeDefined();
      expect(lastCall[0]).toBe('http://localhost:1031/v1/data/collector');
      expect(lastCall[1]?.body).toBeDefined();
      expect(JSON.parse(lastCall[1]?.body as string)).toEqual(want);
    });
  });
});

function getConfigurationEndpointResult(mode = 'default') {
  const filePath = path.resolve(__dirname, 'testdata', 'flag-configuration', mode + '.json');
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  return JSON.stringify(JSON.parse(fileContent));
}

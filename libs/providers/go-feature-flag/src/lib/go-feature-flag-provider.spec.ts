/**
 * @jest-environment node
 */
import {
  Client,
  ErrorCode,
  OpenFeature,
  ProviderStatus,
  StandardResolutionReasons,
} from '@openfeature/server-sdk';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import {GoFeatureFlagProvider} from './go-feature-flag-provider';
import {GoFeatureFlagProxyResponse} from './model';
import TestLogger from './test-logger';

describe('GoFeatureFlagProvider', () => {
  const endpoint = 'http://go-feature-flag-relay-proxy.local:1031/';
  const dataCollectorEndpoint = `${endpoint}v1/data/collector`;
  const axiosMock = new MockAdapter(axios);
  const validBoolResponse: GoFeatureFlagProxyResponse<boolean> = {
    value: true,
    variationType: 'trueVariation',
    reason: StandardResolutionReasons.TARGETING_MATCH,
    failed: false,
    trackEvents: true,
    version: '1.0.0',
    metadata: {
      description: 'a description of the flag',
      issue_number: 1,
    },
    cacheable: true,
  };

  let goff: GoFeatureFlagProvider;
  let cli: Client;
  const testLogger = new TestLogger();

  afterEach(async () => {
    await OpenFeature.close();
    axiosMock.reset();
    axiosMock.resetHistory();
    testLogger.reset();
    await OpenFeature.close();
  });

  beforeEach(async () => {
    await OpenFeature.close();
    axiosMock.reset();
    axiosMock.resetHistory();
    goff = new GoFeatureFlagProvider({endpoint});
    OpenFeature.setProvider('test-provider', goff);
    cli = OpenFeature.getClient('test-provider');
  });

  describe('common usecases and errors', () => {
    it('should be an instance of GoFeatureFlagProvider', () => {
      const goff = new GoFeatureFlagProvider({endpoint});
      expect(goff).toBeInstanceOf(GoFeatureFlagProvider);
    });
    it('should throw an error if proxy not ready', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;
      axiosMock.onPost(dns).reply(404);
      const res = await cli.getBooleanDetails(flagName, false, {targetingKey})
      const want = {
        errorCode: ErrorCode.PROVIDER_NOT_READY,
        errorMessage: 'impossible to call go-feature-flag relay proxy on http://go-feature-flag-relay-proxy.local:1031/v1/feature/random-flag/eval: Error: Request failed with status code 404',
        flagKey: flagName,
        reason: StandardResolutionReasons.ERROR,
        value: false,
        flagMetadata: {}
      };
      expect(res).toEqual(want);
    });
    it('should throw an error if the call timeout', async () => {

      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;
      axiosMock.onPost(dns).timeout();
      const res = await cli.getBooleanDetails(flagName, false, {targetingKey})
      const want = {
        errorCode: ErrorCode.GENERAL,
        errorMessage: 'impossible to retrieve the random-flag on time: Error: timeout of 0ms exceeded',
        flagKey: flagName,
        reason: StandardResolutionReasons.ERROR,
        value: false,
        flagMetadata: {}
      };
      expect(res).toEqual(want);
    });
    describe('error codes in HTTP response', () => {
      it('SDK error codes should return correct code', async () => {
        const flagName = 'random-other-flag';
        const targetingKey = 'user-key';
        const dns = `${endpoint}v1/feature/${flagName}/eval`;
        axiosMock.onPost(dns).reply(200, {
          value: true,
          variationType: 'trueVariation',
          errorCode: ErrorCode.PROVIDER_NOT_READY,
        } as GoFeatureFlagProxyResponse<boolean>);
        const res = await cli.getBooleanDetails(flagName, false, {targetingKey})
        const want = {
          errorCode: ErrorCode.PROVIDER_NOT_READY,
          flagKey: flagName,
          reason: StandardResolutionReasons.UNKNOWN,
          value: true,
          variant: 'trueVariation',
          flagMetadata: {}
        };
        expect(res).toEqual(want);
      });
      it('unknown error codes should return GENERAL code', async () => {
        const flagName = 'random-other-other-flag';
        const targetingKey = 'user-key';
        const dns = `${endpoint}v1/feature/${flagName}/eval`;
        axiosMock.onPost(dns).reply(200, {
          value: true,
          variationType: 'trueVariation',
          errorCode: 'NOT-AN-SDK-ERROR',
        } as unknown as GoFeatureFlagProxyResponse<boolean>);
        const res = await cli.getBooleanDetails(flagName, false, {targetingKey})
        const want = {
          errorCode: ErrorCode.GENERAL,
          flagKey: flagName,
          reason: StandardResolutionReasons.UNKNOWN,
          value: true,
          variant: 'trueVariation',
          flagMetadata: {}
        };
        expect(res).toEqual(want);
      });
    });
    it('should throw an error if we fail in other network errors case', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;
      axiosMock.onPost(dns).networkError();
      const res = await cli.getBooleanDetails(flagName, false, {targetingKey})
      const want = {
        errorCode: ErrorCode.GENERAL,
        errorMessage: `unknown error while retrieving flag ${flagName} for user ${targetingKey}: Error: Network Error`,
        flagKey: flagName,
        reason: StandardResolutionReasons.ERROR,
        value: false,
        flagMetadata: {}
      };
      expect(res).toEqual(want);
    });
    it('should throw an error if the flag does not exists', async () => {
      const flagName = 'unknown-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, {
        value: 'sdk-default',
        variationType: 'trueVariation',
        errorCode: ErrorCode.FLAG_NOT_FOUND,
      } as GoFeatureFlagProxyResponse<string>);
      const res = await cli.getStringDetails(flagName, 'sdk-default', {targetingKey})
      const want = {
        errorCode: ErrorCode.FLAG_NOT_FOUND,
        errorMessage: `Flag ${flagName} was not found in your configuration`,
        flagKey: flagName,
        reason: StandardResolutionReasons.ERROR,
        value: 'sdk-default',
        flagMetadata: {}
      };
      expect(res).toEqual(want);
    });
    it('should throw an error if invalid api key is provided', async () => {
      const flagName = 'unauthorized';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;
      axiosMock.onPost(dns).reply(401, {} as GoFeatureFlagProxyResponse<string>);
      const res = await cli.getStringDetails(flagName, 'sdk-default', {targetingKey})
      const want = {
        errorCode: ErrorCode.GENERAL,
        errorMessage: 'invalid token used to contact GO Feature Flag relay proxy instance',
        flagKey: flagName,
        reason: StandardResolutionReasons.ERROR,
        value: 'sdk-default',
        flagMetadata: {}
      };
      expect(res).toEqual(want);
    });
    it('should be valid with an API key provided', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, {
        value: true,
        variationType: 'trueVariation',
        reason: StandardResolutionReasons.TARGETING_MATCH,
        failed: false,
        trackEvents: true,
        version: '1.0.0',
      } as GoFeatureFlagProxyResponse<boolean>);
      const res = await cli.getBooleanDetails(flagName, false, {targetingKey})
      const want = {
        flagKey: flagName,
        reason: StandardResolutionReasons.TARGETING_MATCH,
        value: true,
        variant: 'trueVariation',
        flagMetadata: {}
      };
      expect(res).toEqual(want);
    });
    it('provider should start not ready', async () => {
      const goff = new GoFeatureFlagProvider({endpoint});
      expect(goff.status).toEqual(ProviderStatus.NOT_READY);
    });
    it('provider should be ready after after setting the provider to Open Feature', async () => {
      expect(goff.status).toEqual(ProviderStatus.READY);
    });
    it('should return an error if calling evaluation with provider not ready', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, validBoolResponse);
      axiosMock.onPost(dataCollectorEndpoint).reply(500, {});

      const goff = new GoFeatureFlagProvider({
        endpoint,
        flagCacheTTL: 3000,
        flagCacheSize: 100,
        dataFlushInterval: 2000, // in milliseconds
      }, testLogger)

      expect(goff.status).toEqual(ProviderStatus.NOT_READY);
      const got = await goff.resolveBooleanEvaluation(flagName, false, {targetingKey});
      const want = {
        errorCode: ErrorCode.PROVIDER_NOT_READY,
        errorMessage: 'Provider in a status that does not allow to serve flag: NOT_READY',
        reason: StandardResolutionReasons.ERROR,
        value: false
      };
      expect(got).toEqual(want);
    });
  });

  describe('resolveBooleanEvaluation', () => {
    it('should throw an error if we expect a boolean and got another type', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, {
        value: 'true',
        variationType: 'trueVariation',
      } as GoFeatureFlagProxyResponse<string>);
      const res = await cli.getBooleanDetails(flagName, false, {targetingKey})
      const want = {
        errorCode: ErrorCode.TYPE_MISMATCH,
        errorMessage: 'Flag value random-flag had unexpected type string, expected boolean.',
        flagKey: flagName,
        reason: StandardResolutionReasons.ERROR,
        value: false,
        flagMetadata: {}
      };
      expect(res).toEqual(want);
    });

    it('should resolve a valid boolean flag with TARGETING_MATCH reason', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, {
        value: true,
        variationType: 'trueVariation',
        reason: StandardResolutionReasons.TARGETING_MATCH,
        failed: false,
        trackEvents: true,
        version: '1.0.0',
      } as GoFeatureFlagProxyResponse<boolean>);

      const res = await cli.getBooleanDetails(flagName, false, {targetingKey})
      const want = {
        flagKey: flagName,
        reason: StandardResolutionReasons.TARGETING_MATCH,
        value: true,
        flagMetadata: {},
        variant: 'trueVariation'
      };
      expect(res).toEqual(want);
    });
    it('should resolve a valid boolean flag with SPLIT reason', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, {
        value: true,
        variationType: 'trueVariation',
        reason: StandardResolutionReasons.SPLIT,
        failed: false,
        trackEvents: true,
        version: '1.0.0',
      } as GoFeatureFlagProxyResponse<boolean>);

      const res = await cli.getBooleanDetails(flagName, false, {targetingKey})
      const want = {
        flagKey: flagName,
        reason: StandardResolutionReasons.SPLIT,
        value: true,
        flagMetadata: {},
        variant: 'trueVariation'
      };
      expect(res).toEqual(want);
    });
    it('should use boolean default value if the flag is disabled', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, {
        value: true,
        variationType: 'defaultSdk',
        reason: StandardResolutionReasons.DISABLED,
        failed: false,
        trackEvents: true,
        version: '1.0.0',
      } as GoFeatureFlagProxyResponse<boolean>);
      const res = await cli.getBooleanDetails(flagName, false, {targetingKey})
      const want = {
        flagKey: flagName,
        reason: StandardResolutionReasons.DISABLED,
        value: false,
        flagMetadata: {},
      };
      expect(res).toEqual(want);
    });
  });
  describe('resolveStringEvaluation', () => {
    it('should throw an error if we expect a string and got another type', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, {
        value: true,
        variationType: 'trueVariation',
      } as GoFeatureFlagProxyResponse<boolean>);

      const res = await cli.getStringDetails(flagName, 'false', {targetingKey})
      const want = {
        flagKey: flagName,
        reason: StandardResolutionReasons.ERROR,
        errorMessage:`Flag value ${flagName} had unexpected type boolean, expected string.`,
        errorCode: ErrorCode.TYPE_MISMATCH,
        value: 'false',
        flagMetadata: {},
      };
      expect(res).toEqual(want);
    });
    it('should resolve a valid string flag with TARGETING_MATCH reason', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, {
        value: 'true value',
        variationType: 'trueVariation',
        reason: StandardResolutionReasons.TARGETING_MATCH,
        failed: false,
        trackEvents: true,
        version: '1.0.0',
      } as GoFeatureFlagProxyResponse<string>);

      const res = await cli.getStringDetails(flagName, 'default', {targetingKey})
      const want = {
        flagKey: flagName,
        reason: StandardResolutionReasons.TARGETING_MATCH,
        value: 'true value',
        variant: 'trueVariation',
        flagMetadata: {},
      };
      expect(res).toEqual(want);
    });
    it('should resolve a valid string flag with SPLIT reason', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, {
        value: 'true value',
        variationType: 'trueVariation',
        reason: StandardResolutionReasons.SPLIT,
        failed: false,
        trackEvents: true,
        version: '1.0.0',
      } as GoFeatureFlagProxyResponse<string>);

      const res = await cli.getStringDetails(flagName, 'default', {targetingKey})
      const want = {
        flagKey: flagName,
        reason: StandardResolutionReasons.SPLIT,
        value: 'true value',
        variant: 'trueVariation',
        flagMetadata: {},
      };
      expect(res).toEqual(want);
    });
    it('should use string default value if the flag is disabled', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, {
        value: 'defaultSdk',
        variationType: 'defaultSdk',
        reason: StandardResolutionReasons.DISABLED,
        failed: false,
        trackEvents: true,
        version: '1.0.0',
      } as GoFeatureFlagProxyResponse<string>);

      const res = await cli.getStringDetails(flagName, 'randomDefaultValue', {targetingKey})
      const want = {
        flagKey: flagName,
        reason: StandardResolutionReasons.DISABLED,
        value: 'randomDefaultValue',
        flagMetadata: {},
      };
      expect(res).toEqual(want);
    });
  });
  describe('resolveNumberEvaluation', () => {
    it('should throw an error if we expect a number and got another type', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, {
        value: true,
        variationType: 'trueVariation',
      } as GoFeatureFlagProxyResponse<boolean>);

      const res = await cli.getNumberDetails(flagName, 14, {targetingKey})
      const want = {
        flagKey: flagName,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.TYPE_MISMATCH,
        errorMessage: `Flag value ${flagName} had unexpected type boolean, expected number.`,
        value: 14,
        flagMetadata: {},
      };
      expect(res).toEqual(want);
    });
    it('should resolve a valid number flag with TARGETING_MATCH reason', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, {
        value: 14,
        variationType: 'trueVariation',
        reason: StandardResolutionReasons.TARGETING_MATCH,
        failed: false,
        trackEvents: true,
        version: '1.0.0',
      } as GoFeatureFlagProxyResponse<number>);

      const res = await cli.getNumberDetails(flagName, 14, {targetingKey})
      const want = {
        flagKey: flagName,
        reason: StandardResolutionReasons.TARGETING_MATCH,
        value: 14,
        variant:'trueVariation',
        flagMetadata: {},
      };
      expect(res).toEqual(want);
    });
    it('should resolve a valid number flag with SPLIT reason', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, {
        value: 14,
        variationType: 'trueVariation',
        reason: StandardResolutionReasons.SPLIT,
        failed: false,
        trackEvents: true,
        version: '1.0.0',
      } as GoFeatureFlagProxyResponse<number>);

      const res = await cli.getNumberDetails(flagName, 14, {targetingKey})
      const want = {
        flagKey: flagName,
        reason: StandardResolutionReasons.SPLIT,
        value: 14,
        variant:'trueVariation',
        flagMetadata: {},
      };
      expect(res).toEqual(want);
    });
    it('should use number default value if the flag is disabled', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, {
        value: 123,
        variationType: 'defaultSdk',
        reason: StandardResolutionReasons.DISABLED,
        failed: false,
        trackEvents: true,
        version: '1.0.0',
      } as GoFeatureFlagProxyResponse<number>);

      const res = await cli.getNumberDetails(flagName, 14, {targetingKey})
      const want = {
        flagKey: flagName,
        reason: StandardResolutionReasons.DISABLED,
        value: 14,
        flagMetadata: {},
      };
      expect(res).toEqual(want);
    });
  });
  describe('resolveObjectEvaluation', () => {
    it('should throw an error if we expect a json array and got another type', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, {
        value: true,
        variationType: 'trueVariation',
      } as GoFeatureFlagProxyResponse<boolean>);

      const res = await cli.getObjectDetails(flagName, {}, {targetingKey})
      const want = {
        flagKey: flagName,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.TYPE_MISMATCH,
        errorMessage: `Flag value ${flagName} had unexpected type boolean, expected object.`,
        value: {},
        flagMetadata: {},
      };
      expect(res).toEqual(want);
    });
    it('should resolve a valid object flag with TARGETING_MATCH reason', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, {
        value: {key: true},
        variationType: 'trueVariation',
        reason: StandardResolutionReasons.TARGETING_MATCH,
        failed: false,
        trackEvents: true,
        version: '1.0.0',
      } as GoFeatureFlagProxyResponse<object>);

      const res = await cli.getObjectDetails(flagName, {key: 'default'}, {targetingKey})
      const want = {
        flagKey: flagName,
        reason: StandardResolutionReasons.TARGETING_MATCH,
        value: {key: true},
        flagMetadata: {},
        variant: 'trueVariation'
      };
      expect(res).toEqual(want);
    });
    it('should resolve a valid object flag with SPLIT reason', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, {
        value: {key: true},
        variationType: 'trueVariation',
        reason: StandardResolutionReasons.SPLIT,
        failed: false,
        trackEvents: true,
        version: '1.0.0',
      } as GoFeatureFlagProxyResponse<object>);

      const res = await cli.getObjectDetails(flagName, {key: 'default'}, {targetingKey})
      const want = {
        flagKey: flagName,
        reason: StandardResolutionReasons.SPLIT,
        value: {key: true},
        flagMetadata: {},
        variant: 'trueVariation'
      };
      expect(res).toEqual(want);
    });
    it('should use object default value if the flag is disabled', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, {
        value: {key: 123},
        variationType: 'defaultSdk',
        reason: StandardResolutionReasons.DISABLED,
        failed: false,
        trackEvents: true,
        version: '1.0.0',
      } as GoFeatureFlagProxyResponse<object>);

      const res = await cli.getObjectDetails(flagName, {key: 'default'}, {targetingKey})
      const want = {
        flagKey: flagName,
        reason: StandardResolutionReasons.DISABLED,
        value: {key: 'default'},
        flagMetadata: {},
      };
      expect(res).toEqual(want);
    });
    it('should resolve a valid json array flag with TARGETING_MATCH reason', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, {
        value: ['1', '2'],
        variationType: 'trueVariation',
        reason: StandardResolutionReasons.TARGETING_MATCH,
        failed: false,
        trackEvents: true,
        version: '1.0.0',
      } as GoFeatureFlagProxyResponse<object>);

      const res = await cli.getObjectDetails(flagName, {key: 'default'}, {targetingKey})
      const want = {
        flagKey: flagName,
        reason: StandardResolutionReasons.TARGETING_MATCH,
        value: ['1', '2'],
        flagMetadata: {},
        variant: 'trueVariation'
      };
      expect(res).toEqual(want);
    });
    it('should resolve a valid json array flag with SPLIT reason', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, {
        value: ['1', '2'],
        variationType: 'trueVariation',
        reason: StandardResolutionReasons.SPLIT,
        failed: false,
        trackEvents: true,
        version: '1.0.0',
      } as GoFeatureFlagProxyResponse<object>);


      const res = await cli.getObjectDetails(flagName, {key: 'default'}, {targetingKey})
      const want = {
        flagKey: flagName,
        reason: StandardResolutionReasons.SPLIT,
        value: ['1', '2'],
        flagMetadata: {},
        variant: 'trueVariation'
      };
      expect(res).toEqual(want);
    });
    it('should use json array default value if the flag is disabled', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, {
        value: ['key', '123'],
        variationType: 'defaultSdk',
        reason: StandardResolutionReasons.DISABLED,
        failed: false,
        trackEvents: true,
        version: '1.0.0',
      } as GoFeatureFlagProxyResponse<object>);

      const res = await cli.getObjectDetails(flagName, ['key', '124'], {targetingKey})
      const want = {
        flagKey: flagName,
        reason: StandardResolutionReasons.DISABLED,
        value: ['key', '124'],
        flagMetadata: {},
      };
      expect(res).toEqual(want);
    });
    it('should return metadata associated to the flag', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, {
        value: true,
        variationType: 'trueVariation',
        reason: StandardResolutionReasons.TARGETING_MATCH,
        failed: false,
        trackEvents: true,
        version: '1.0.0',
        metadata: {
          description: 'a description of the flag',
          issue_number: 1,
        },
        cacheable: true,
      } as GoFeatureFlagProxyResponse<boolean>);

      const res = await cli.getBooleanDetails(flagName, false, {targetingKey})
      const want = {
        flagKey: flagName,
        reason: StandardResolutionReasons.TARGETING_MATCH,
        value: true,
        variant: 'trueVariation',
        flagMetadata: {
          description: 'a description of the flag',
          issue_number: 1,
        },
      };
      expect(res).toEqual(want);
    });
  });
  describe('cache testing', () => {
    it('should use the cache if we evaluate 2 times the same flag', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, validBoolResponse);
      const goff = new GoFeatureFlagProvider({
        endpoint,
        flagCacheTTL: 3000,
        flagCacheSize: 1,
        disableDataCollection: true,
      })
      OpenFeature.setProvider('test-provider-cache', goff);
      const cli = OpenFeature.getClient('test-provider-cache');
      const got1 = await cli.getBooleanDetails(flagName, false, {targetingKey});
      const got2 = await cli.getBooleanDetails(flagName, false, {targetingKey});
      expect(got1.reason).toEqual(StandardResolutionReasons.TARGETING_MATCH);
      expect(got2.reason).toEqual(StandardResolutionReasons.CACHED);
      expect(axiosMock.history['post'].length).toBe(1);
    });

    it('should use not use the cache if we evaluate 2 times the same flag if cache is disabled', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, validBoolResponse);
      const goff = new GoFeatureFlagProvider({
        endpoint,
        disableCache: true,
        disableDataCollection: true,
      })
      OpenFeature.setProvider('test-provider-cache', goff);
      const cli = OpenFeature.getClient('test-provider-cache');
      const got1 = await cli.getBooleanDetails(flagName, false, {targetingKey});
      const got2 = await cli.getBooleanDetails(flagName, false, {targetingKey});
      expect(got1).toEqual(got2);
      expect(axiosMock.history['post'].length).toBe(2);
    });

    it('should not retrieve from the cache if max size cache is reached', async () => {
      const flagName1 = 'random-flag';
      const flagName2 = 'random-flag-1';
      const targetingKey = 'user-key';
      const dns1 = `${endpoint}v1/feature/${flagName1}/eval`;
      const dns2 = `${endpoint}v1/feature/${flagName2}/eval`;
      axiosMock.onPost(dns1).reply(200, validBoolResponse);
      axiosMock.onPost(dns2).reply(200, validBoolResponse);
      const goff = new GoFeatureFlagProvider({
        endpoint,
        flagCacheSize: 1,
        disableDataCollection: true,
      })
      OpenFeature.setProvider('test-provider-cache', goff);
      const cli = OpenFeature.getClient('test-provider-cache');
      await cli.getBooleanDetails(flagName1, false, {targetingKey});
      await cli.getBooleanDetails(flagName2, false, {targetingKey});
      await cli.getBooleanDetails(flagName1, false, {targetingKey});
      expect(axiosMock.history['post'].length).toBe(3);
    });

    it('should not store in the cache if cacheable is false', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns1 = `${endpoint}v1/feature/${flagName}/eval`;
      axiosMock.onPost(dns1).reply(200, {...validBoolResponse, cacheable: false});
      const goff = new GoFeatureFlagProvider({
        endpoint,
        flagCacheSize: 1,
        disableDataCollection: true,
      })
      OpenFeature.setProvider('test-provider-cache', goff);
      const cli = OpenFeature.getClient('test-provider-cache');
      await cli.getBooleanDetails(flagName, false, {targetingKey});
      await cli.getBooleanDetails(flagName, false, {targetingKey});
      expect(axiosMock.history['post'].length).toBe(2);
    });

    it('should not retrieve from the cache it the TTL is reached', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns1 = `${endpoint}v1/feature/${flagName}/eval`;
      axiosMock.onPost(dns1).reply(200, {...validBoolResponse});
      const goff = new GoFeatureFlagProvider({
        endpoint,
        flagCacheSize: 1,
        disableDataCollection: true,
        flagCacheTTL: 200,
      })
      OpenFeature.setProvider('test-provider-cache',goff);
      const cli = OpenFeature.getClient('test-provider-cache');
      await cli.getBooleanDetails(flagName, false, {targetingKey});
      await new Promise((r) => setTimeout(r, 300));
      await cli.getBooleanDetails(flagName, false, {targetingKey});
      expect(axiosMock.history['post'].length).toBe(2);
    });

    it('should not retrieve from the cache if we have 2 different flag', async () => {
      const flagName1 = 'random-flag';
      const flagName2 = 'random-flag-1';
      const targetingKey = 'user-key';
      const dns1 = `${endpoint}v1/feature/${flagName1}/eval`;
      const dns2 = `${endpoint}v1/feature/${flagName2}/eval`;
      axiosMock.onPost(dns1).reply(200, validBoolResponse);
      axiosMock.onPost(dns2).reply(200, validBoolResponse);
      const goff = new GoFeatureFlagProvider({
        endpoint,
        flagCacheSize: 1,
        disableDataCollection: true,
      })
      OpenFeature.setProvider('test-provider-cache', goff);
      const cli = OpenFeature.getClient('test-provider-cache');
      await cli.getBooleanDetails(flagName1, false, {targetingKey});
      await cli.getBooleanDetails(flagName2, false, {targetingKey});
      expect(axiosMock.history['post'].length).toBe(2);
    });
    it('should not retrieve from the cache if context properties are different but same targeting key', async () => {
      const flagName1 = 'random-flag';
      const targetingKey = 'user-key';
      const dns1 = `${endpoint}v1/feature/${flagName1}/eval`;
      axiosMock.onPost(dns1).reply(200, validBoolResponse);
      const goff = new GoFeatureFlagProvider({
        endpoint,
        flagCacheSize: 1,
        disableDataCollection: true,
      })
      OpenFeature.setProvider('test-provider-cache', goff);
      const cli = OpenFeature.getClient('test-provider-cache');
      await cli.getBooleanDetails(flagName1, false, {targetingKey, email: 'foo.bar@gofeatureflag.org'});
      await cli.getBooleanDetails(flagName1, false, {targetingKey, email: 'bar.foo@gofeatureflag.org'});
      expect(axiosMock.history['post'].length).toBe(2);
    });
  });
  describe('data collector testing', () => {
    it('should call the data collector when closing Open Feature', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, validBoolResponse);
      const goff = new GoFeatureFlagProvider({
        endpoint,
        flagCacheTTL: 3000,
        flagCacheSize: 100,
        dataFlushInterval: 1000, // in milliseconds
      })
      const providerName = expect.getState().currentTestName || 'test';
      OpenFeature.setProvider(providerName, goff);
      const cli = OpenFeature.getClient(providerName);
      await cli.getBooleanDetails(flagName, false, {targetingKey});
      await cli.getBooleanDetails(flagName, false, {targetingKey});
      await OpenFeature.close()
      const collectorCalls = axiosMock.history['post'].filter(i => i.url === dataCollectorEndpoint);
      expect(collectorCalls.length).toBe(1);
      const got = JSON.parse(collectorCalls[0].data);
      expect(isNaN(got.events[0].creationDate)).toBe(false);
      const want = {
        events: [{
          contextKind: 'user',
          kind: 'feature',
          creationDate: got.events[0].creationDate,
          default: false,
          key: 'random-flag',
          value: true,
          variation: 'trueVariation',
          userKey: 'user-key'
        }], meta: {provider: 'open-feature-js-sdk'}
      };
      expect(want).toEqual(got);
    });

    it('should call the data collector when waiting more than the dataFlushInterval', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, validBoolResponse);
      const goff = new GoFeatureFlagProvider({
        endpoint,
        flagCacheTTL: 3000,
        flagCacheSize: 100,
        dataFlushInterval: 100, // in milliseconds
      })
      const providerName = expect.getState().currentTestName || 'test';
      OpenFeature.setProvider(providerName, goff);
      const cli = OpenFeature.getClient(providerName);
      await cli.getBooleanDetails(flagName, false, {targetingKey});
      await cli.getBooleanDetails(flagName, false, {targetingKey});
      await new Promise((r) => setTimeout(r, 130));
      const collectorCalls = axiosMock.history['post'].filter(i => i.url === dataCollectorEndpoint);
      expect(collectorCalls.length).toBe(1);
    });

    it('should call the data collector multiple time while waiting dataFlushInterval time', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, validBoolResponse);
      const goff = new GoFeatureFlagProvider({
        endpoint,
        flagCacheTTL: 3000,
        flagCacheSize: 100,
        dataFlushInterval: 100, // in milliseconds
      })
      const providerName = expect.getState().currentTestName || 'test';
      OpenFeature.setProvider(providerName, goff);
      const cli = OpenFeature.getClient(providerName);
      await cli.getBooleanDetails(flagName, false, {targetingKey});
      await cli.getBooleanDetails(flagName, false, {targetingKey});
      await new Promise((r) => setTimeout(r, 130));
      const collectorCalls = axiosMock.history['post'].filter(i => i.url === dataCollectorEndpoint);
      expect(collectorCalls.length).toBe(1);
      axiosMock.resetHistory();
      await cli.getBooleanDetails(flagName, false, {targetingKey});
      await cli.getBooleanDetails(flagName, false, {targetingKey});
      await new Promise((r) => setTimeout(r, 130));
      const collectorCalls2 = axiosMock.history['post'].filter(i => i.url === dataCollectorEndpoint);
      expect(collectorCalls2.length).toBe(1);
    });

    it('should not call the data collector before the dataFlushInterval', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, validBoolResponse);
      const goff = new GoFeatureFlagProvider({
        endpoint,
        flagCacheTTL: 3000,
        flagCacheSize: 100,
        dataFlushInterval: 200, // in milliseconds
      })
      const providerName = expect.getState().currentTestName || 'test';
      OpenFeature.setProvider(providerName, goff);
      const cli = OpenFeature.getClient(providerName);
      await cli.getBooleanDetails(flagName, false, {targetingKey});
      await cli.getBooleanDetails(flagName, false, {targetingKey});
      await new Promise((r) => setTimeout(r, 130));
      const collectorCalls = axiosMock.history['post'].filter(i => i.url === dataCollectorEndpoint);

      expect(collectorCalls.length).toBe(0);
    });

    it('should have a log when data collector is not available', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, validBoolResponse);
      axiosMock.onPost(dataCollectorEndpoint).reply(500, {});

      const goff = new GoFeatureFlagProvider({
        endpoint,
        flagCacheTTL: 3000,
        flagCacheSize: 100,
        dataFlushInterval: 2000, // in milliseconds
      }, testLogger)
      const providerName = expect.getState().currentTestName || 'test';
      OpenFeature.setProvider(providerName, goff);
      const cli = OpenFeature.getClient(providerName);
      await cli.getBooleanDetails(flagName, false, {targetingKey});
      await cli.getBooleanDetails(flagName, false, {targetingKey});
      await OpenFeature.close();

      expect(testLogger.inMemoryLogger['error'].length).toBe(1);
      expect(testLogger.inMemoryLogger['error']).toContain('impossible to send the data to the collector: Error: Request failed with status code 500')
    });
  });
});

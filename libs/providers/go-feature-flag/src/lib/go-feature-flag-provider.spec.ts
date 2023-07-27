/**
 * @jest-environment node
 */
import {
  ErrorCode,
  FlagNotFoundError,
  OpenFeature, ProviderStatus,
  ResolutionDetails,
  StandardResolutionReasons,
  TypeMismatchError
} from '@openfeature/js-sdk';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import {ProxyNotReady} from './errors/proxyNotReady';
import {ProxyTimeout} from './errors/proxyTimeout';
import {UnknownError} from './errors/unknownError';
import {Unauthorized} from './errors/unauthorized';
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
  const testLogger = new TestLogger();

  afterEach(async () => {
    await OpenFeature.close();
    await axiosMock.reset();
    await axiosMock.resetHistory();
    testLogger.reset();
  });

  beforeEach(async () => {
    await OpenFeature.close();
    await axiosMock.reset();
    await axiosMock.resetHistory();
    goff = new GoFeatureFlagProvider({endpoint});
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
      await goff
        .resolveBooleanEvaluation(flagName, false, {targetingKey})
        .catch((err) => {
          expect(err).toBeInstanceOf(ProxyNotReady);
          expect(err.message).toEqual(
            `impossible to call go-feature-flag relay proxy on ${dns}: Error: Request failed with status code 404`
          );
        });
    });
    it('should throw an error if the call timeout', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;
      axiosMock.onPost(dns).timeout();
      await goff
        .resolveBooleanEvaluation(flagName, false, {targetingKey})
        .catch((err) => {
          expect(err).toBeInstanceOf(ProxyTimeout);
          expect(err.message).toEqual(
            `impossible to retrieve the ${flagName} on time: Error: timeout of 0ms exceeded`
          );
        });
    });
    describe('error codes in HTTP response', () => {
      it('SDK error codes should return correct code', async () => {
        const flagName = 'random-other-flag';
        const targetingKey = 'user-key';
        const dns = `${endpoint}v1/feature/${flagName}/eval`;
        axiosMock.onPost(dns).reply(200, {
          value: true,
          variationType: 'trueVariation',
          errorCode: ErrorCode.PARSE_ERROR,
        } as GoFeatureFlagProxyResponse<boolean>);
        await goff
          .resolveBooleanEvaluation(flagName, false, {targetingKey})
          .then((result) => {
            expect(result.errorCode).toEqual(ErrorCode.PARSE_ERROR)
          })
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
        await goff
          .resolveBooleanEvaluation(flagName, false, {targetingKey})
          .then((result) => {
            expect(result.errorCode).toEqual(ErrorCode.GENERAL)
          })
      });
    });
    it('should throw an error if we fail in other network errors case', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;
      axiosMock.onPost(dns).networkError();
      await goff
        .resolveBooleanEvaluation(flagName, false, {targetingKey})
        .catch((err) => {
          expect(err).toBeInstanceOf(UnknownError);
          expect(err.message).toEqual(
            `unknown error while retrieving flag ${flagName} for user ${targetingKey}: Error: Network Error`
          );
        });
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

      await goff
        .resolveStringEvaluation(flagName, 'sdk-default', {targetingKey})
        .catch((err) => {
          expect(err).toBeInstanceOf(FlagNotFoundError);
          expect(err.message).toEqual(
            `Flag ${flagName} was not found in your configuration`
          );
        });
    });
    it('should throw an error if invalid api key is provided', async () => {
      const flagName = 'unauthorized';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;
      const apiKey = 'invalid-api-key';

      axiosMock.onPost(dns).reply(401, {} as GoFeatureFlagProxyResponse<string>);

      const authenticatedGoff = new GoFeatureFlagProvider({endpoint, apiKey});
      await authenticatedGoff
        .resolveStringEvaluation(flagName, 'sdk-default', {targetingKey})
        .catch((err) => {
          expect(err).toBeInstanceOf(Unauthorized);
          expect(err.message).toEqual(
            'invalid token used to contact GO Feature Flag relay proxy instance'
          );
        });
    });
    it('should be valid with an API key provided', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;
      const apiKey = 'valid-api-key';

      axiosMock.onPost(dns).reply(200, {
        value: true,
        variationType: 'trueVariation',
        reason: StandardResolutionReasons.TARGETING_MATCH,
        failed: false,
        trackEvents: true,
        version: '1.0.0',
      } as GoFeatureFlagProxyResponse<boolean>);

      const authenticatedGoff = new GoFeatureFlagProvider({endpoint, apiKey});
      await authenticatedGoff
        .resolveBooleanEvaluation(flagName, false, {targetingKey})
        .then((res) => {
          expect(res).toEqual({
            reason: StandardResolutionReasons.TARGETING_MATCH,
            value: true,
            variant: 'trueVariation',
          } as ResolutionDetails<boolean>);
        });
    });
    it('provider should start not ready', async () => {
      const goff = new GoFeatureFlagProvider({endpoint});
      expect(goff.status).toEqual(ProviderStatus.NOT_READY);
    });
    it('provider should be ready after after setting the provider to Open Feature', async () => {
      OpenFeature.setProvider( 'goff', goff);
      expect(goff.status).toEqual(ProviderStatus.READY);
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

      await goff
        .resolveBooleanEvaluation(flagName, false, {targetingKey})
        .catch((err) => {
          expect(err).toBeInstanceOf(TypeMismatchError);
          expect(err.message).toEqual(
            `Flag value ${flagName} had unexpected type string, expected boolean.`
          );
        });
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

      await goff
        .resolveBooleanEvaluation(flagName, false, {targetingKey})
        .then((res) => {
          expect(res).toEqual({
            reason: StandardResolutionReasons.TARGETING_MATCH,
            value: true,
            variant: 'trueVariation',
          } as ResolutionDetails<boolean>);
        });
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

      await goff
        .resolveBooleanEvaluation(flagName, false, {targetingKey})
        .then((res) => {
          expect(res).toEqual({
            reason: StandardResolutionReasons.SPLIT,
            value: true,
            variant: 'trueVariation',
          } as ResolutionDetails<boolean>);
        });
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

      await goff
        .resolveBooleanEvaluation(flagName, false, {targetingKey})
        .then((res) => {
          expect(res).toEqual({
            reason: StandardResolutionReasons.DISABLED,
            value: false,
          } as ResolutionDetails<boolean>);
        });
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

      await goff
        .resolveStringEvaluation(flagName, 'false', {targetingKey})
        .catch((err) => {
          expect(err).toBeInstanceOf(TypeMismatchError);
          expect(err.message).toEqual(
            `Flag value ${flagName} had unexpected type boolean, expected string.`
          );
        });
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

      await goff
        .resolveStringEvaluation(flagName, 'default', {targetingKey})
        .then((res) => {
          expect(res).toEqual({
            reason: StandardResolutionReasons.TARGETING_MATCH,
            value: 'true value',
            variant: 'trueVariation',
          } as ResolutionDetails<string>);
        });
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

      await goff
        .resolveStringEvaluation(flagName, 'default', {targetingKey})
        .then((res) => {
          expect(res).toEqual({
            reason: StandardResolutionReasons.SPLIT,
            value: 'true value',
            variant: 'trueVariation',
          } as ResolutionDetails<string>);
        });
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

      await goff
        .resolveStringEvaluation(flagName, 'randomDefaultValue', {
          targetingKey,
        })
        .then((res) => {
          expect(res).toEqual({
            reason: StandardResolutionReasons.DISABLED,
            value: 'randomDefaultValue',
          } as ResolutionDetails<string>);
        });
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

      await goff
        .resolveNumberEvaluation(flagName, 14, {targetingKey})
        .catch((err) => {
          expect(err).toBeInstanceOf(TypeMismatchError);
          expect(err.message).toEqual(
            `Flag value ${flagName} had unexpected type boolean, expected number.`
          );
        });
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

      await goff
        .resolveNumberEvaluation(flagName, 17, {targetingKey})
        .then((res) => {
          expect(res).toEqual({
            reason: StandardResolutionReasons.TARGETING_MATCH,
            value: 14,
            variant: 'trueVariation',
          } as ResolutionDetails<number>);
        });
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

      await goff
        .resolveNumberEvaluation(flagName, 17, {targetingKey})
        .then((res) => {
          expect(res).toEqual({
            reason: StandardResolutionReasons.SPLIT,
            value: 14,
            variant: 'trueVariation',
          } as ResolutionDetails<number>);
        });
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

      await goff
        .resolveNumberEvaluation(flagName, 124, {targetingKey})
        .then((res) => {
          expect(res).toEqual({
            reason: StandardResolutionReasons.DISABLED,
            value: 124,
          } as ResolutionDetails<number>);
        });
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

      await goff
        .resolveObjectEvaluation(flagName, {}, {targetingKey})
        .catch((err) => {
          expect(err).toBeInstanceOf(TypeMismatchError);
          expect(err.message).toEqual(
            `Flag value ${flagName} had unexpected type boolean, expected object.`
          );
        });
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

      await goff
        .resolveObjectEvaluation(flagName, {key: 'default'}, {targetingKey})
        .then((res) => {
          expect(res).toEqual({
            reason: StandardResolutionReasons.TARGETING_MATCH,
            value: {key: true},
            variant: 'trueVariation',
          } as ResolutionDetails<object>);
        });
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

      await goff
        .resolveObjectEvaluation(flagName, {key: 'default'}, {targetingKey})
        .then((res) => {
          expect(res).toEqual({
            reason: StandardResolutionReasons.SPLIT,
            value: {key: true},
            variant: 'trueVariation',
          } as ResolutionDetails<object>);
        });
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

      await goff
        .resolveObjectEvaluation(flagName, {key: 124}, {targetingKey})
        .then((res) => {
          expect(res).toEqual({
            reason: StandardResolutionReasons.DISABLED,
            value: {key: 124},
          } as ResolutionDetails<object>);
        });
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

      await goff
        .resolveObjectEvaluation(flagName, {key: 'default'}, {targetingKey})
        .then((res) => {
          expect(res).toEqual({
            reason: StandardResolutionReasons.TARGETING_MATCH,
            value: ['1', '2'],
            variant: 'trueVariation',
          } as ResolutionDetails<object>);
        });
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

      await goff
        .resolveObjectEvaluation(flagName, {key: 'default'}, {targetingKey})
        .then((res) => {
          expect(res).toEqual({
            reason: StandardResolutionReasons.SPLIT,
            value: ['1', '2'],
            variant: 'trueVariation',
          } as ResolutionDetails<object>);
        });
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

      await goff
        .resolveObjectEvaluation(flagName, ['key', '124'], {targetingKey})
        .then((res) => {
          expect(res).toEqual({
            reason: StandardResolutionReasons.DISABLED,
            value: ['key', '124'],
          } as ResolutionDetails<object>);
        });
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

      await goff
        .resolveBooleanEvaluation(flagName, false, {targetingKey})
        .then((res) => {
          expect(res).toEqual({
            reason: StandardResolutionReasons.TARGETING_MATCH,
            value: true,
            variant: 'trueVariation',
            flagMetadata: {
              description: 'a description of the flag',
              issue_number: 1,
            }
          } as ResolutionDetails<boolean>);
        });
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
      OpenFeature.setProvider(goff);
      const cli = OpenFeature.getClient();
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
      OpenFeature.setProvider(goff);
      const cli = OpenFeature.getClient();
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
      OpenFeature.setProvider(goff);
      const cli = OpenFeature.getClient();
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
      OpenFeature.setProvider(goff);
      const cli = OpenFeature.getClient();
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
      OpenFeature.setProvider(goff);
      const cli = OpenFeature.getClient();
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
      OpenFeature.setProvider(goff);
      const cli = OpenFeature.getClient();
      await cli.getBooleanDetails(flagName1, false, {targetingKey});
      await cli.getBooleanDetails(flagName2, false, {targetingKey});
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

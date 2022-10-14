/**
 * @jest-environment node
 */
import {
  ErrorCode,
  FlagNotFoundError, ResolutionDetails,
  StandardResolutionReasons,
  TypeMismatchError
} from '@openfeature/js-sdk';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { ProxyNotReady } from './errors/proxyNotReady';
import { ProxyTimeout } from './errors/proxyTimeout';
import { UnknownError } from './errors/unknownError';
import { GoFeatureFlagProvider } from './go-feature-flag-provider';
import { GoFeatureFlagProxyResponse } from './model';

describe('GoFeatureFlagProvider', () => {
  const endpoint = 'http://go-feature-flag-relay-proxy.local:1031/';
  const axiosMock = new MockAdapter(axios);
  let goff: GoFeatureFlagProvider;

  afterEach(() => {
    axiosMock.reset();
  });

  beforeEach(() => {
    goff = new GoFeatureFlagProvider({ endpoint });
  });

  describe('common usecases and errors', () => {
    it('should be an instance of GoFeatureFlagProvider', () => {
      const goff = new GoFeatureFlagProvider({ endpoint });
      expect(goff).toBeInstanceOf(GoFeatureFlagProvider);
    });

    it('should throw an error if proxy not ready', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;
      axiosMock.onPost(dns).reply(404);
      await goff
        .resolveBooleanEvaluation(flagName, false, { targetingKey })
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
        .resolveBooleanEvaluation(flagName, false, { targetingKey })
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
          .resolveBooleanEvaluation(flagName, false, { targetingKey })
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
          .resolveBooleanEvaluation(flagName, false, { targetingKey })
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
        .resolveBooleanEvaluation(flagName, false, { targetingKey })
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
        .resolveStringEvaluation(flagName, 'sdk-default', { targetingKey })
        .catch((err) => {
          expect(err).toBeInstanceOf(FlagNotFoundError);
          expect(err.message).toEqual(
            `Flag ${flagName} was not found in your configuration`
          );
        });
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
        .resolveBooleanEvaluation(flagName, false, { targetingKey })
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
        .resolveBooleanEvaluation(flagName, false, { targetingKey })
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
        .resolveBooleanEvaluation(flagName, false, { targetingKey })
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
        .resolveBooleanEvaluation(flagName, false, { targetingKey })
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
        .resolveStringEvaluation(flagName, 'false', { targetingKey })
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
        .resolveStringEvaluation(flagName, 'default', { targetingKey })
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
        .resolveStringEvaluation(flagName, 'default', { targetingKey })
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
        .resolveNumberEvaluation(flagName, 14, { targetingKey })
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
        .resolveNumberEvaluation(flagName, 17, { targetingKey })
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
        .resolveNumberEvaluation(flagName, 17, { targetingKey })
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
        .resolveNumberEvaluation(flagName, 124, { targetingKey })
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
        .resolveObjectEvaluation(flagName, {}, { targetingKey })
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
        value: { key: true },
        variationType: 'trueVariation',
        reason: StandardResolutionReasons.TARGETING_MATCH,
        failed: false,
        trackEvents: true,
        version: '1.0.0',
      } as GoFeatureFlagProxyResponse<object>);

      await goff
        .resolveObjectEvaluation(flagName, { key: 'default' }, { targetingKey })
        .then((res) => {
          expect(res).toEqual({
            reason: StandardResolutionReasons.TARGETING_MATCH,
            value: { key: true },
            variant: 'trueVariation',
          } as ResolutionDetails<object>);
        });
    });
    it('should resolve a valid object flag with SPLIT reason', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, {
        value: { key: true },
        variationType: 'trueVariation',
        reason: StandardResolutionReasons.SPLIT,
        failed: false,
        trackEvents: true,
        version: '1.0.0',
      } as GoFeatureFlagProxyResponse<object>);

      await goff
        .resolveObjectEvaluation(flagName, { key: 'default' }, { targetingKey })
        .then((res) => {
          expect(res).toEqual({
            reason: StandardResolutionReasons.SPLIT,
            value: { key: true },
            variant: 'trueVariation',
          } as ResolutionDetails<object>);
        });
    });
    it('should use object default value if the flag is disabled', async () => {
      const flagName = 'random-flag';
      const targetingKey = 'user-key';
      const dns = `${endpoint}v1/feature/${flagName}/eval`;

      axiosMock.onPost(dns).reply(200, {
        value: { key: 123 },
        variationType: 'defaultSdk',
        reason: StandardResolutionReasons.DISABLED,
        failed: false,
        trackEvents: true,
        version: '1.0.0',
      } as GoFeatureFlagProxyResponse<object>);

      await goff
        .resolveObjectEvaluation(flagName, { key: 124 }, { targetingKey })
        .then((res) => {
          expect(res).toEqual({
            reason: StandardResolutionReasons.DISABLED,
            value: { key: 124 },
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
        .resolveObjectEvaluation(flagName, { key: 'default' }, { targetingKey })
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
        .resolveObjectEvaluation(flagName, { key: 'default' }, { targetingKey })
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
        .resolveObjectEvaluation(flagName, ['key', '124'], { targetingKey })
        .then((res) => {
          expect(res).toEqual({
            reason: StandardResolutionReasons.DISABLED,
            value: ['key', '124'],
          } as ResolutionDetails<object>);
        });
    });
  });
});

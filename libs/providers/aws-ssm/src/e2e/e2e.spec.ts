import { OpenFeature } from '@openfeature/server-sdk';
import { AwsSsmProvider } from '../lib/aws-ssm-provider';
import { GetParameterCommand, GetParameterCommandOutput, SSMClient } from '@aws-sdk/client-ssm';
import { mockClient } from 'aws-sdk-client-mock';

const ssmMock = mockClient(SSMClient);

describe('AWS SSM Provider E2E', () => {
  const featureFlags = OpenFeature.getClient();
  OpenFeature.setProvider(
    new AwsSsmProvider({
      ssmClientConfig: {
        region: 'eu-west-1',
      },
      cacheOpts: {
        enabled: true,
        size: 1,
        ttl: 10,
      },
    }),
  );

  describe('when using OpenFeature with AWS SSM Provider to retrieve a boolean', () => {
    it('should use AWS SSM in order to retrieve the value', async () => {
      const res: GetParameterCommandOutput = {
        Parameter: {
          Name: '/lambda/loggingEnabled',
          Value: 'true',
        },
        $metadata: {},
      };
      ssmMock.on(GetParameterCommand).resolves(res);
      const flagValue = await featureFlags.getBooleanValue('/lambda/loggingEnabled', false);
      expect(flagValue).toBe(true);
    });
  });
  describe('when using OpenFeature with AWS SSM Provider to retrieve a string', () => {
    it('should use AWS SSM in order to retrieve the value', async () => {
      const res: GetParameterCommandOutput = {
        Parameter: {
          Name: '/lambda/logLevel',
          Value: 'ERROR',
        },
        $metadata: {},
      };
      ssmMock.on(GetParameterCommand).resolves(res);
      const flagValue = await featureFlags.getStringValue('/lambda/logLevel', 'INFO');
      expect(flagValue).toBe('ERROR');
    });
  });
  describe('when using OpenFeature with AWS SSM Provider to retrieve a number', () => {
    it('should use AWS SSM in order to retrieve the value', async () => {
      const res: GetParameterCommandOutput = {
        Parameter: {
          Name: '/lambda/logRetentionInDays',
          Value: '3',
        },
        $metadata: {},
      };
      ssmMock.on(GetParameterCommand).resolves(res);
      const flagValue = await featureFlags.getNumberValue('/lambda/logRetentionInDays', 14);
      expect(flagValue).toBe(3);
    });
  });
  describe('when using OpenFeature with AWS SSM Provider to retrieve an object', () => {
    it('should use AWS SSM in order to retrieve the value', async () => {
      const res: GetParameterCommandOutput = {
        Parameter: {
          Name: '/lambda/env',
          Value: JSON.stringify({
            PROCESS_NUMBER: 3,
            SOME_ENV_VAR: 4,
          }),
        },
        $metadata: {},
      };
      ssmMock.on(GetParameterCommand).resolves(res);
      const flagValue = await featureFlags.getObjectValue('/lambda/env', {});
      expect(flagValue).toStrictEqual({
        PROCESS_NUMBER: 3,
        SOME_ENV_VAR: 4,
      });
    });
  });
});

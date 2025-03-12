import {
  EvaluationContext,
  Provider,
  JsonValue,
  ResolutionDetails,
  Logger,
  StandardResolutionReasons,
} from '@openfeature/server-sdk';
import { GetParameterCommandInput, SSMClient, SSMClientConfig } from '@aws-sdk/client-ssm';
import { AwsSsmProviderConfig } from './types';
import { SSMService } from './ssm-service';

export class AwsSsmProvider implements Provider {
  metadata = {
    name: AwsSsmProvider.name,
  };

  readonly runsOn = 'server';
  readonly service: SSMService;
  hooks = [];

  constructor(config: AwsSsmProviderConfig) {
    this.service = new SSMService(config.ssmClientConfig);
  }

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    try {
      return await this.service.getBooleanValue(flagKey, defaultValue);
    } catch (e) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.DEFAULT,
      };
    }
  }

  async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    try {
      return await this.service.getStringValue(flagKey);
    } catch (e) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.DEFAULT,
      };
    }
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    throw new Error('Method not implemented.');
  }

  resolveObjectEvaluation<U extends JsonValue>(
    flagKey: string,
    defaultValue: U,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<U>> {
    throw new Error('Method not implemented.');
  }
}

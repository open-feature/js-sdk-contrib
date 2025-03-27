import {
  EvaluationContext,
  Provider,
  JsonValue,
  ResolutionDetails,
  StandardResolutionReasons,
  ErrorCode,
} from '@openfeature/server-sdk';
import { InternalServerError } from '@aws-sdk/client-ssm';
import { AwsSsmProviderConfig } from './types';
import { SSMService } from './ssm-service';
import { Cache } from './cache';

export class AwsSsmProvider implements Provider {
  metadata = {
    name: AwsSsmProvider.name,
  };

  readonly runsOn = 'server';
  readonly service: SSMService;
  hooks = [];
  cache: Cache;

  constructor(config: AwsSsmProviderConfig) {
    this.service = new SSMService(config.ssmClientConfig, config.enableDecryption);
    this.cache = new Cache(config.cacheOpts);
  }

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    const cachedValue = this.cache.get(flagKey);
    if (cachedValue) {
      return {
        value: cachedValue.value,
        reason: StandardResolutionReasons.CACHED,
      };
    }
    try {
      const res = await this.service.getBooleanValue(flagKey);
      this.cache.set(flagKey, res);
      return res;
    } catch (err) {
      let errMsg = 'An unknown error occurred';

      if (err instanceof InternalServerError) {
        errMsg = err.message;
      }

      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.GENERAL,
        errorMessage: errMsg,
      };
    }
  }

  async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    const cachedValue = this.cache.get(flagKey);
    if (cachedValue) {
      return {
        value: cachedValue.value,
        reason: StandardResolutionReasons.CACHED,
      };
    }
    try {
      const res = await this.service.getStringValue(flagKey);
      this.cache.set(flagKey, res);
      return res;
    } catch (err) {
      let errMsg = 'An unknown error occurred';

      if (err instanceof InternalServerError) {
        errMsg = err.message;
      }

      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.GENERAL,
        errorMessage: errMsg,
      };
    }
  }

  async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    const cachedValue = this.cache.get(flagKey);
    if (cachedValue) {
      return {
        value: cachedValue.value,
        reason: StandardResolutionReasons.CACHED,
      };
    }
    try {
      return await this.service.getNumberValue(flagKey);
    } catch (err) {
      let errMsg = 'An unknown error occurred';

      if (err instanceof InternalServerError) {
        errMsg = err.message;
      }

      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.GENERAL,
        errorMessage: errMsg,
      };
    }
  }

  async resolveObjectEvaluation<U extends JsonValue>(
    flagKey: string,
    defaultValue: U,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<U>> {
    const cachedValue = this.cache.get(flagKey);
    if (cachedValue) {
      return {
        value: cachedValue.value,
        reason: StandardResolutionReasons.CACHED,
      };
    }
    try {
      return await this.service.getObjectValue(flagKey);
    } catch (err) {
      let errMsg = 'An unknown error occurred';

      if (err instanceof InternalServerError) {
        errMsg = err.message;
      }

      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorCode.GENERAL,
        errorMessage: errMsg,
      };
    }
  }
}

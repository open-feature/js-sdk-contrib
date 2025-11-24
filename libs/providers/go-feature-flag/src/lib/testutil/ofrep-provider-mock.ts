import type { EvaluationContext, ResolutionDetails } from '@openfeature/server-sdk';
import type { JsonValue } from '@openfeature/server-sdk';

export class OfrepProviderMock {
  lastEvaluationContext?: EvaluationContext;

  async evaluateString(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    this.lastEvaluationContext = context;
    return {
      value: 'this is a test value',
      reason: 'TARGETING_MATCH',
      variant: 'enabled',
      errorCode: undefined,
      errorMessage: undefined,
    };
  }

  async evaluateBoolean(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    this.lastEvaluationContext = context;
    return {
      value: true,
      reason: 'TARGETING_MATCH',
      variant: 'enabled',
      errorCode: undefined,
      errorMessage: undefined,
    };
  }

  async evaluateNumber(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    this.lastEvaluationContext = context;
    return {
      value: 12.21,
      reason: 'TARGETING_MATCH',
      variant: 'enabled',
      errorCode: undefined,
      errorMessage: undefined,
    };
  }

  async evaluateInteger(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    this.lastEvaluationContext = context;
    return {
      value: 12,
      reason: 'TARGETING_MATCH',
      variant: 'enabled',
      errorCode: undefined,
      errorMessage: undefined,
    };
  }

  async evaluateObject<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<T>> {
    this.lastEvaluationContext = context;
    return {
      value: 'this is a test value' as T,
      reason: 'TARGETING_MATCH',
      variant: 'enabled',
      errorCode: undefined,
      errorMessage: undefined,
    };
  }
}

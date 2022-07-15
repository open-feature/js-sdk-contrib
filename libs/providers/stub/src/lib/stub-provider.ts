import {
  EvaluationContext,
  FlagEvaluationOptions,
  Provider,
  ResolutionDetails,
} from '@openfeature/nodejs-sdk';

export class StubProvider implements Provider {
  metadata = {
    name: StubProvider.name,
  };

  contextTransformer = () => ({});

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    transformedContext: EvaluationContext,
    options: FlagEvaluationOptions
  ): Promise<ResolutionDetails<boolean>> {
    console.log('fix');
    throw new Error('Method not implemented.');
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    transformedContext: EvaluationContext,
    options: FlagEvaluationOptions
  ): Promise<ResolutionDetails<string>> {
    throw new Error('Method not implemented.');
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    transformedContext: EvaluationContext,
    options: FlagEvaluationOptions
  ): Promise<ResolutionDetails<number>> {
    throw new Error('Method not implemented.');
  }

  resolveObjectEvaluation<U extends object>(
    flagKey: string,
    defaultValue: U,
    transformedContext: EvaluationContext,
    options: FlagEvaluationOptions
  ): Promise<ResolutionDetails<U>> {
    throw new Error('Method not implemented.');
  }
}

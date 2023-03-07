import { EvaluationContext, Provider, JsonValue, ResolutionDetails } from '@openfeature/js-sdk';

export class InMemoryProvider implements Provider {
  metadata = {
    name: InMemoryProvider.name,
  };

  hooks = [];

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext
  ): Promise<ResolutionDetails<boolean>> {
    throw new Error('Method not implemented.');
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext
  ): Promise<ResolutionDetails<string>> {
    throw new Error('Method not implemented.');
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext
  ): Promise<ResolutionDetails<number>> {
    throw new Error('Method not implemented.');
  }

  resolveObjectEvaluation<U extends JsonValue>(
    flagKey: string,
    defaultValue: U,
    context: EvaluationContext
  ): Promise<ResolutionDetails<U>> {
    throw new Error('Method not implemented.');
  }
}

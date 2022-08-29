import {
  EvaluationContext,
  Provider,
  ResolutionDetails,
  Hook,
} from '@openfeature/nodejs-sdk';

export class FederatedProvider implements Provider {
  metadata = {
    name: FederatedProvider.name,
  };

  hooks: Hook[] = [];

  constructor(private readonly providers: Provider[]) {
    providers.forEach((p) => this.hooks.push(...(p.hooks ?? [])));
  }

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext
  ): Promise<ResolutionDetails<boolean>> {
    for (const provider of this.providers) {
      const result = await provider.resolveBooleanEvaluation(
        flagKey,
        defaultValue,
        context
      );
      if (!result.errorCode) {
        return result;
      }
    }
    throw new Error('All registered providers failed');
  }

  async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext
  ): Promise<ResolutionDetails<string>> {
    for (const provider of this.providers) {
      const result = await provider.resolveStringEvaluation(
        flagKey,
        defaultValue,
        context
      );
      if (!result.errorCode) {
        return result;
      }
    }
    throw new Error('All registered providers failed');
  }

  async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext
  ): Promise<ResolutionDetails<number>> {
    for (const provider of this.providers) {
      const result = await provider.resolveNumberEvaluation(
        flagKey,
        defaultValue,
        context
      );
      if (!result.errorCode) {
        return result;
      }
    }
    throw new Error('All registered providers failed');
  }

  async resolveObjectEvaluation<U extends object>(
    flagKey: string,
    defaultValue: U,
    context: EvaluationContext
  ): Promise<ResolutionDetails<U>> {
    for (const provider of this.providers) {
      const result = await provider.resolveObjectEvaluation(
        flagKey,
        defaultValue,
        context
      );
      if (!result.errorCode) {
        return result;
      }
    }
    throw new Error('All registered providers failed');
  }
}

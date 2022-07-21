import {
  EvaluationContext,
  Provider,
  ResolutionDetails,
  ProviderOptions
} from '@openfeature/nodejs-sdk';
import {IService} from './service/IService'
import HTTPService from './service/http/service'

export interface FlagdProviderOptions extends ProviderOptions {
  service?: IService
}

export class FlagdProvider implements Provider {
  metadata = {
    name: FlagdProvider.name,
  };

  private readonly service: IService

  constructor(options?: FlagdProviderOptions) {
      if (!options || options.service == undefined) {
        this.service = new HTTPService()
        return
      }
      this.service = options.service
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    transformedContext: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    return this.service.ResolveBoolean(flagKey, defaultValue, transformedContext)
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    transformedContext: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    return this.service.ResolveString(flagKey, defaultValue, transformedContext)

  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    transformedContext: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    return this.service.ResolveNumber(flagKey, defaultValue, transformedContext)

  }

  resolveObjectEvaluation<U extends object>(
    flagKey: string,
    defaultValue: U,
    transformedContext: EvaluationContext,
  ): Promise<ResolutionDetails<U>> {
    return this.service.ResolveObject(flagKey, defaultValue, transformedContext)

  }
}

import {
  EvaluationContext,
  Provider,
  ResolutionDetails,
} from '@openfeature/nodejs-sdk';
import { Service } from './service/service';
import { GRPCService } from './service/grpc/service';
import { FlagdProviderOptions, getConfig } from './configuration';

export class FlagdProvider implements Provider {
  metadata = {
    name: 'flagd Provider',
  };

  private readonly _service: Service;

  constructor(options?: FlagdProviderOptions, service?: Service) {
    this._service = service ? service : new GRPCService(getConfig(options));
  }

  resolveBooleanEvaluation(
    flagKey: string,
    _: boolean,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<boolean>> {
    return this._service.resolveBoolean(flagKey, transformedContext);
  }

  resolveStringEvaluation(
    flagKey: string,
    _: string,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<string>> {
    return this._service.resolveString(flagKey, transformedContext);
  }

  resolveNumberEvaluation(
    flagKey: string,
    _: number,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<number>> {
    return this._service.resolveNumber(flagKey, transformedContext);
  }

  resolveObjectEvaluation<U extends object>(
    flagKey: string,
    _: U,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<U>> {
    return this._service.resolveObject(flagKey, transformedContext);
  }
}

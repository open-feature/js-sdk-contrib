import {
  EvaluationContext,
  Provider,
  ResolutionDetails,
} from '@openfeature/nodejs-sdk';
import {Service} from './service/Service'
import {HTTPService} from './service/http/service'
import {GRPCService} from './service/grpc/service'

export interface FlagdProviderOptions  {
  service?: "grpc" | "http";
  host?: string;
  port?: number;
  protocol?: "http" | "https"
}

export class FlagdProvider implements Provider {
  metadata = {
    name: FlagdProvider.name,
  };

  private readonly service: Service

  constructor(options?: FlagdProviderOptions) {
    const {
      service,
      host,
      port,
      protocol
    }: FlagdProviderOptions = {
      service: "http",
      host: "localhost",
      port: 8080,
      protocol: 'http',
      ...options
    }

    if (service == "http") {
      this.service = new HTTPService({
        host,
        port,
        protocol
      })
    } else {
      this.service = new GRPCService({
        host,
        port
      })
    }
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    transformedContext: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    return this.service.resolveBoolean(flagKey, defaultValue, transformedContext)
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    transformedContext: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    return this.service.resolveString(flagKey, defaultValue, transformedContext)

  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    transformedContext: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    return this.service.resolveNumber(flagKey, defaultValue, transformedContext)

  }

  resolveObjectEvaluation<U extends object>(
    flagKey: string,
    defaultValue: U,
    transformedContext: EvaluationContext,
  ): Promise<ResolutionDetails<U>> {
    return this.service.resolveObject(flagKey, defaultValue, transformedContext)
  }
}

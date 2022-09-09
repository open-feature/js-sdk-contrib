import {
  EvaluationContext,
  Provider,
  ResolutionDetails,
} from '@openfeature/nodejs-sdk';
import { Service } from './service/Service';
import { HTTPService } from './service/http/service';
import { ConnectService } from './service/connect/service';

export interface FlagdProviderOptions {
  service?: 'http' | 'connect';
  host?: string;
  port?: number;
  protocol?: 'http' | 'https';
}

export class FlagdProvider implements Provider {
  metadata = {
    name: 'flagD Provider',
  };

  private readonly service: Service;

  constructor(options?: FlagdProviderOptions) {
    const { service, host, port, protocol }: FlagdProviderOptions = {
      service: 'http',
      host: 'localhost',
      port: 8013,
      protocol: 'http',
      ...options,
    };

    if (service === 'http') {
      this.service = new HTTPService({
        host,
        port,
        protocol,
      });
    } else {
      this.service = new ConnectService({
        host,
        port,
      })
    }
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<boolean>> {
    return this.service.resolveBoolean(
      flagKey,
      defaultValue,
      transformedContext
    );
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<string>> {
    return this.service.resolveString(
      flagKey,
      defaultValue,
      transformedContext
    );
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<number>> {
    return this.service.resolveNumber(
      flagKey,
      defaultValue,
      transformedContext
    );
  }

  resolveObjectEvaluation<U extends object>(
    flagKey: string,
    defaultValue: U,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<U>> {
    return this.service.resolveObject(
      flagKey,
      defaultValue,
      transformedContext
    );
  }
}

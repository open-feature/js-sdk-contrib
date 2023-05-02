import {
  EvaluationContext,
  Provider,
  JsonValue,
  ResolutionDetails,
  StandardResolutionReasons, ErrorCode, ProviderMetadata, Logger
} from '@openfeature/web-sdk';
import {
  basicLogger, LDClient, LDLogger
} from 'launchdarkly-js-client-sdk';

import {LaunchDarklyProviderOptions} from './launchdarkly-provider-options';
import translateContext from './translate-context';
import translateResult from './translate-result';


/**
 * Create a ResolutionDetails for an evaluation that produced a type different
 * from the expected type.
 * @param value The default value to populate the ResolutionDetails with.
 * @returns A ResolutionDetails with the default value.
 */
function wrongTypeResult<T>(value: T): ResolutionDetails<T> {
  return {
    value,
    reason: StandardResolutionReasons.ERROR,
    errorCode: ErrorCode.TYPE_MISMATCH,
  };
}

export class LaunchDarklyClientProvider implements Provider {
  readonly metadata: ProviderMetadata = {
    name: 'launchdarkly-client-provider',
  };

  private readonly logger: LDLogger;

  constructor(private client: LDClient, options: LaunchDarklyProviderOptions = {}) {
    if (options.logger) {
      this.logger = options.logger;
    } else {
      this.logger = basicLogger({ level: 'info' });
    }
  }

  initialize(context: EvaluationContext): Promise<void> {
    return this.client.waitUntilReady();
  }

  onClose(): Promise<void> {
    return this.client.close();
  }

  async onContextChange(oldContext: EvaluationContext, newContext: EvaluationContext): Promise<void> {
    await this.client.identify(this.translateContext(newContext));
  }

  resolveBooleanEvaluation(flagKey: string, defaultValue: boolean, context: EvaluationContext, logger: Logger): ResolutionDetails<boolean> {
    const res = this.client.variationDetail(
      flagKey,
      defaultValue,
    );
    if (typeof res.value === 'boolean') {
      return translateResult(res);
    }
    return wrongTypeResult(defaultValue);
  }

  resolveNumberEvaluation(flagKey: string, defaultValue: number, context: EvaluationContext, logger: Logger): ResolutionDetails<number> {
    const res = this.client.variationDetail(
      flagKey,
      defaultValue,
    );
    if (typeof res.value === 'number') {
      return translateResult(res);
    }
    return wrongTypeResult(defaultValue);
  }

  resolveObjectEvaluation<T extends JsonValue>(flagKey: string, defaultValue: T, context: EvaluationContext, logger: Logger): ResolutionDetails<T> {
    const res = this.client.variationDetail(
      flagKey,
      defaultValue,
    );
    if (typeof res.value === 'object') {
      return translateResult(res);
    }
    return wrongTypeResult<T>(defaultValue);
  }

  resolveStringEvaluation(flagKey: string, defaultValue: string, context: EvaluationContext, logger: Logger): ResolutionDetails<string> {
    const res = this.client.variationDetail(
      flagKey,
      defaultValue,
    );
    if (typeof res.value === 'string') {
      return translateResult(res);
    }
    return wrongTypeResult(defaultValue);
  }

  private translateContext(context: EvaluationContext) {
    return translateContext(this.logger, context);
  }

}



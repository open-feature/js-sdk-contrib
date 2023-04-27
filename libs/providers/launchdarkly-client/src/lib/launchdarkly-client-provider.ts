import {
  EvaluationContext,
  Provider,
  JsonValue,
  ResolutionDetails,
  StandardResolutionReasons, ErrorCode, FlagValue, Hook
} from '@openfeature/js-sdk';
import {
  basicLogger, LDClient, LDLogger,
} from 'launchdarkly-js-client-sdk';
import {LDFlagSet} from 'launchdarkly-js-sdk-common';
import isEqual from 'lodash.isequal';

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
  private readonly logger: LDLogger;

  metadata = {
    name: 'launchdarkly-client-provider',
  };

  constructor(private readonly client: LDClient, options: LaunchDarklyProviderOptions = {}) {
    if (options.logger) {
      this.logger = options.logger;
    } else {
      this.logger = basicLogger({ level: 'info' });
    }
  }

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    await this.setContext(context);
    const res = await this.client.variationDetail(
      flagKey,
      defaultValue,
    );
    if (typeof res.value === 'boolean') {
      return translateResult(res);
    }
    return wrongTypeResult(defaultValue);
  }

  async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    await this.setContext(context);
    const res = await this.client.variationDetail(
      flagKey,
      defaultValue,
    );
    if (typeof res.value === 'string') {
      return translateResult(res);
    }
    return wrongTypeResult(defaultValue);
  }

  async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    await this.setContext(context);
    const res = await this.client.variationDetail(
      flagKey,
      defaultValue,
    );
    if (typeof res.value === 'number') {
      return translateResult(res);
    }
    return wrongTypeResult(defaultValue);
  }

  async resolveObjectEvaluation<U extends JsonValue>(
    flagKey: string,
    defaultValue: U,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<U>> {
    await this.setContext(context);
    const res = await this.client.variationDetail(
      flagKey,
      defaultValue,
    );
    if (typeof res.value === 'object') {
      return translateResult(res);
    }
    return wrongTypeResult<U>(defaultValue);
  }

  get hooks(): Hook<FlagValue>[] {
    return [];
  }

  private translateContext(context: EvaluationContext) {
    return translateContext(this.logger, context);
  }

  /**
   * launchdarkly-js-client-sdk saves the context this prevents triggering an update if the context has not changed
   * @param context
   * @private
   */
  private async setContext(context: EvaluationContext): Promise<LDFlagSet> {
    const newContext = this.translateContext(context);
    const oldContext = this.client.getContext();
    if(isEqual(newContext, oldContext)) {
      return oldContext
    }
    return await this.client.identify(newContext);
  }
}

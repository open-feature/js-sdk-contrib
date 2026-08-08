import type { EvaluationContext, JsonValue, Logger, ResolutionDetails } from '@openfeature/core';
import type { OpenFeatureEventEmitter } from '@openfeature/server-sdk';
import { ServerProviderEvents } from '@openfeature/server-sdk';
import type { IEvaluator } from './evaluator';
import { OFREPProvider, type OFREPProviderOptions } from '@openfeature/ofrep-provider';
import type { GoFeatureFlagProviderOptions } from '../go-feature-flag-provider-options';
import { isomorphicFetch } from '../helper/fetch-api';
import { buildOfrepHeaders, withoutOfrepEnvironment } from '../helper/ofrep';

/**
 * Renders a delegate failure for the error event and the log line.
 *
 * The delegate wraps a transport failure in an `OFREPApiFetchError` whose own message is the
 * constant `"The OFREP request failed."` and whose `cause` is what actually went wrong, so
 * reporting only the outer message would tell a handler that something failed and nothing else.
 * @param error - whatever the delegate threw
 * @returns a message naming the failure, including its cause when there is one
 */
function describeFailure(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const cause = error.cause;
  if (cause instanceof Error && cause.message && cause.message !== error.message) {
    return `${error.message} ${cause.message}`;
  }
  return error.message;
}

export class RemoteEvaluator implements IEvaluator {
  /**
   * The OFREP provider
   */
  private readonly ofrepProvider: OFREPProvider;
  /**
   * The logger to use.
   */
  private readonly logger?: Logger;
  /**
   * Where loss of the relay proxy and recovery from it are reported.
   *
   * Optional because this evaluator is also built as the §16 fallback inside the in-process
   * evaluator, which reports its own health from the polling loop. A fallback that also emitted
   * would report the provider broken for a relay proxy the in-process path is not depending on.
   */
  private readonly eventChannel?: OpenFeatureEventEmitter;
  /** Whether the provider has already reported the error, so it is reported only once. */
  private errored = false;

  constructor(
    options: GoFeatureFlagProviderOptions,
    deps?: { logger?: Logger; eventChannel?: OpenFeatureEventEmitter },
  ) {
    this.logger = deps?.logger;
    this.eventChannel = deps?.eventChannel;
    const ofrepOptions: OFREPProviderOptions = {
      baseUrl: options.endpoint,
      timeoutMs: options.timeout,
      fetchImplementation: options.fetchImplementation ?? isomorphicFetch(),
      headers: buildOfrepHeaders(options),
    };

    // Constructed with the OFREP environment variables removed. Every field is supplied explicitly
    // here, so anything the environment contributed would be configuration this caller did not ask
    // for - an endpoint or credentials taken from the process rather than from the options object.
    this.ofrepProvider = withoutOfrepEnvironment(() => new OFREPProvider(ofrepOptions));
  }

  /**
   * Evaluates a boolean flag.
   * @param flagKey - The key of the flag to evaluate.
   * @param defaultValue - The default value to return if the flag is not found.
   * @param evaluationContext - The context in which to evaluate the flag.
   * @returns The resolution details of the flag evaluation.
   */
  async evaluateBoolean(
    flagKey: string,
    defaultValue: boolean,
    evaluationContext?: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    return this.withHealthReporting(() =>
      this.ofrepProvider.resolveBooleanEvaluation(flagKey, defaultValue, evaluationContext ?? {}),
    );
  }

  /**
   * Runs one delegate evaluation, recording whether the relay proxy answered.
   *
   * The delegate draws the line this needs: a failure the server described - `FLAG_NOT_FOUND`,
   * `TYPE_MISMATCH`, `TARGETING_KEY_MISSING` - comes back as resolution details carrying an
   * `errorCode`, while a failure to obtain any answer at all - the network, a timeout, a `401`, a
   * `429`, an unparseable body - is thrown (`ofrep-core/src/lib/api/ofrep-api.ts:211-232`). Only the
   * second kind says anything about the health of the relay proxy, so only the second kind counts.
   * A flag that does not exist is not an unhealthy provider.
   * @param evaluate - performs the delegate call
   * @returns whatever the delegate returned
   */
  private async withHealthReporting<T>(evaluate: () => Promise<ResolutionDetails<T>>): Promise<ResolutionDetails<T>> {
    try {
      const details = await evaluate();
      this.onEvaluationSucceeded();
      return details;
    } catch (error) {
      this.onEvaluationFailed(error);
      throw error;
    }
  }

  /**
   * Records a successful evaluation, returning the provider to ready if it had been in error.
   */
  private onEvaluationSucceeded(): void {
    if (!this.errored) {
      return;
    }
    this.errored = false;
    this.logger?.info('Remote evaluation recovered, provider is ready again');
    this.eventChannel?.emit(ServerProviderEvents.Ready, {});
  }

  /**
   * Emits `Error` the first time an evaluation fails because the relay proxy could not answer.
   *
   * Later failures are ignored while the provider stays in error; a later success clears that
   * state via {@link onEvaluationSucceeded}.
   * @param error - what the delegate threw, for the log line
   */
  private onEvaluationFailed(error: unknown): void {
    if (this.errored) {
      return;
    }
    this.errored = true;
    const message = describeFailure(error);
    this.logger?.error(`Remote evaluation failed, the relay proxy could not be reached: ${message}`);
    this.eventChannel?.emit(ServerProviderEvents.Error, { message });
  }

  /**
   * Evaluates a string flag.
   * @param flagKey - The key of the flag to evaluate.
   * @param defaultValue - The default value to return if the flag is not found.
   * @param evaluationContext - The context in which to evaluate the flag.
   * @returns The resolution details of the flag evaluation.
   */
  async evaluateString(
    flagKey: string,
    defaultValue: string,
    evaluationContext?: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    return this.withHealthReporting(() =>
      this.ofrepProvider.resolveStringEvaluation(flagKey, defaultValue, evaluationContext ?? {}),
    );
  }

  /**
   * Evaluates a number flag.
   * @param flagKey - The key of the flag to evaluate.
   * @param defaultValue - The default value to return if the flag is not found.
   * @param evaluationContext - The context in which to evaluate the flag.
   * @returns The resolution details of the flag evaluation.
   */
  async evaluateNumber(
    flagKey: string,
    defaultValue: number,
    evaluationContext?: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    return this.withHealthReporting(() =>
      this.ofrepProvider.resolveNumberEvaluation(flagKey, defaultValue, evaluationContext ?? {}),
    );
  }

  /**
   * Evaluates an object flag.
   * @param flagKey - The key of the flag to evaluate.
   * @param defaultValue - The default value to return if the flag is not found.
   * @param evaluationContext - The context in which to evaluate the flag.
   * @returns The resolution details of the flag evaluation.
   */
  evaluateObject<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    evaluationContext?: EvaluationContext,
  ): Promise<ResolutionDetails<T>> {
    return this.withHealthReporting(() =>
      this.ofrepProvider.resolveObjectEvaluation(flagKey, defaultValue, evaluationContext ?? {}),
    );
  }

  /**
   * Checks if the flag is trackable.
   * @param _flagKey - The key of the flag to check.
   * @returns True if the flag is trackable, false otherwise.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isFlagTrackable(_flagKey: string): boolean {
    return false;
  }

  /**
   * Disposes the evaluator.
   * @returns A promise that resolves when the evaluator is disposed.
   */
  dispose(): Promise<void> {
    this.logger?.info('Disposing Remote evaluator');
    return Promise.resolve();
  }

  /**
   * Initializes the evaluator.
   * @returns A promise that resolves when the evaluator is initialized.
   */
  async initialize(): Promise<void> {
    this.logger?.info('Initializing Remote evaluator');
    return Promise.resolve();
  }
}

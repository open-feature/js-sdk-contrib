import type { EvaluationContext, JsonValue, Logger, ResolutionDetails } from '@openfeature/core';
import type { IEvaluator } from './evaluator';
import { OFREPProvider, type OFREPProviderOptions } from '@openfeature/ofrep-provider';
import type { GoFeatureFlagProviderOptions } from '../go-feature-flag-provider-options';
import { isomorphicFetch } from '../helper/fetch-api';
import { HTTP_HEADER_API_KEY } from '../helper/constants';
import { buildRequestHeaders } from '../helper/headers';

/**
 * The environment variables the OFREP delegate reads for itself.
 *
 * `getConfig` consults all three inside the `OFREPProvider` constructor, and merges the headers it
 * finds *underneath* the ones we pass — overriding only on key collision. Passing an explicit
 * `baseUrl` is therefore not enough on its own to keep the environment out of the configuration.
 */
const OFREP_ENV_VARS = ['OFREP_ENDPOINT', 'OFREP_HEADERS', 'OFREP_TIMEOUT_MS'] as const;

/**
 * Runs `construct` with the OFREP environment variables removed, then puts them back.
 *
 * `getConfig` and every read it performs are synchronous, and so is the `OFREPProvider`
 * constructor, so on a single-threaded runtime no other JavaScript can observe the gap. `delete` is
 * used rather than assignment because `process.env.X = undefined` stores the *string* `"undefined"`,
 * which passes the delegate's truthiness guard and would make things worse.
 * @param construct - builds the delegate; must not await
 * @returns whatever `construct` returns
 */
function withoutOfrepEnvironment<T>(construct: () => T): T {
  // Guarded so non-Node runtimes, where there is no environment to isolate, still construct.
  if (typeof process === 'undefined' || !process.env) {
    return construct();
  }

  const saved = OFREP_ENV_VARS.map((name): [string, string | undefined] => [name, process.env[name]]);
  for (const [name] of saved) {
    delete process.env[name];
  }

  try {
    return construct();
  } finally {
    // Restored even when the constructor throws on an invalid URL, and only for the variables that
    // were actually set - re-assigning an absent one would write the string "undefined".
    for (const [name, value] of saved) {
      if (value !== undefined) {
        process.env[name] = value;
      }
    }
  }
}

/**
 * Builds the header list for the delegate: the provider's own entries plus any caller headers.
 *
 * `Content-Type` is deliberately absent. The delegate sets it itself and builds its headers with
 * `new Headers([...])`, which **appends** on a duplicate name rather than replacing - so sending
 * our own put `application/json; charset=utf-8, application/json` on the wire.
 * @param options - the provider options
 * @returns the header list to hand to the delegate
 */
function buildHeaders(options: GoFeatureFlagProviderOptions): [string, string][] {
  const owned: Record<string, string> = {};
  // Truthiness, not a presence check: an empty apiKey must send no authentication header at all.
  if (options.apiKey) {
    owned[HTTP_HEADER_API_KEY] = options.apiKey;
  }

  return Object.entries(buildRequestHeaders(owned, options.headers));
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

  constructor(options: GoFeatureFlagProviderOptions, logger?: Logger) {
    this.logger = logger;
    const ofrepOptions: OFREPProviderOptions = {
      baseUrl: options.endpoint,
      timeoutMs: options.timeout,
      fetchImplementation: options.fetchImplementation ?? isomorphicFetch(),
      headers: buildHeaders(options),
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
    return this.ofrepProvider.resolveBooleanEvaluation(flagKey, defaultValue, evaluationContext ?? {});
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
    return this.ofrepProvider.resolveStringEvaluation(flagKey, defaultValue, evaluationContext ?? {});
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
    return this.ofrepProvider.resolveNumberEvaluation(flagKey, defaultValue, evaluationContext ?? {});
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
    return this.ofrepProvider.resolveObjectEvaluation(flagKey, defaultValue, evaluationContext ?? {});
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

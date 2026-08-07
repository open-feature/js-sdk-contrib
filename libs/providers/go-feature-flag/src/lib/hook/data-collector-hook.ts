import type { Hook, HookContext, EvaluationDetails, FlagMetadata, JsonValue } from '@openfeature/server-sdk';
import type { IEvaluator } from '../evaluator/evaluator';
import type { EventPublisher } from '../service/event-publisher';
import type { FeatureEvent } from '../model';
import { EvaluatorNotFoundException, EventPublisherNotFoundException } from '../exception';
import { getContextKind } from '../helper/event-util';
import { DEFAULT_TARGETING_KEY, EVALUATED_REMOTELY_KEY } from '../helper/constants';

/**
 * Reads the flag version out of the resolution metadata.
 *
 * `FlagMetadata` values are `string | number | boolean`, and a version is meaningfully either of
 * the first two - a GO Feature Flag configuration carries `version: "1.0"` as readily as
 * `version: 1`. A boolean is not a version, so it is dropped rather than stringified into `"true"`.
 * @param flagMetadata - metadata from the resolution, when the stage has any
 * @returns the version, or undefined when the flag carries none
 */
const readVersion = (flagMetadata?: FlagMetadata): string | undefined => {
  const version = flagMetadata?.['version'];
  if (typeof version === 'string') {
    return version;
  }
  if (typeof version === 'number') {
    return String(version);
  }
  return undefined;
};

/**
 * Options for {@link DataCollectorHook}.
 */
export interface DataCollectorHookOptions {
  /** When true, no evaluation is recorded. @default false */
  disableDataCollection?: boolean;
}

/**
 * DataCollectorHook is a hook that collects data during the evaluation of feature flags.
 */
export class DataCollectorHook implements Hook {
  private readonly evaluator: IEvaluator;
  private readonly eventPublisher: EventPublisher;
  /** When true neither stage records anything, whatever the flag's own trackability says. */
  private readonly disableDataCollection: boolean;

  /**
   * DataCollectorHook is a hook that collects data during the evaluation of feature flags.
   * @param evaluator - service to evaluate the flag
   * @param eventPublisher - service to publish events
   * @param options - hook options
   * @throws Error if evaluator or eventPublisher is null
   */
  constructor(evaluator: IEvaluator, eventPublisher: EventPublisher, options?: DataCollectorHookOptions) {
    if (!evaluator) {
      throw new EvaluatorNotFoundException('Evaluator cannot be null');
    }
    if (!eventPublisher) {
      throw new EventPublisherNotFoundException('EventPublisher cannot be null');
    }
    this.evaluator = evaluator;
    this.eventPublisher = eventPublisher;
    this.disableDataCollection = options?.disableDataCollection ?? false;
  }

  /**
   * Whether this evaluation should be recorded.
   *
   * Consulted identically by both stages. Gating only one of them produces telemetry covering
   * successes but not errors (or the reverse), which reads downstream as data loss rather than as
   * the deliberate opt-out the caller asked for.
   * @param flagKey - the flag being evaluated
   * @returns true when an event should be published for this evaluation
   */
  private shouldCollect(flagKey: string): boolean {
    if (this.disableDataCollection) {
      return false;
    }
    return this.evaluator.isFlagTrackable(flagKey);
  }

  /**

   * Called immediately after successful flag evaluation.
   * @param context - Provides context of innovation
   * @param details - Flag evaluation information
   * @param _hints - Caller provided data
   */
  async after<T extends JsonValue>(
    context: HookContext<T>,
    details: EvaluationDetails<T>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _hints?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.shouldCollect(context.flagKey)) {
      // Data collection is off, or the flag is not trackable.
      return;
    }

    // The relay proxy records the evaluations it answers, so exporting one here would double-count
    // it. The metadata stamp is the only signal this hook has that a fallback occurred.
    if (details.flagMetadata?.[EVALUATED_REMOTELY_KEY] === true) {
      return;
    }

    const eventToPublish: FeatureEvent = {
      contextKind: getContextKind(context.context),
      kind: 'feature',
      creationDate: Math.floor(Date.now() / 1000),
      default: false,
      key: context.flagKey,
      value: details.value,
      variation: details.variant ?? 'SdkDefault',
      userKey: context.context?.targetingKey ?? DEFAULT_TARGETING_KEY,
      version: readVersion(details.flagMetadata),
      // Unconditional: the remote evaluator reports every flag as untrackable, so this hook only
      // ever runs for a locally evaluated flag.
      source: 'INPROCESS',
    };

    this.eventPublisher.addEvent(eventToPublish);
  }

  /**
   * Called immediately after an unsuccessful flag evaluation.
   * @param context - Provides context of innovation
   * @param error - Exception representing what went wrong
   * @param hints - Caller provided data
   */
  async error<T extends JsonValue>(
    context: HookContext<T>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _error: Error,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _hints?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.shouldCollect(context.flagKey)) {
      // Data collection is off, or the flag is not trackable.
      return;
    }

    const eventToPublish: FeatureEvent = {
      contextKind: getContextKind(context.context),
      kind: 'feature',
      key: context.flagKey,
      default: true,
      variation: 'SdkDefault',
      value: context.defaultValue,
      userKey: context.context?.targetingKey ?? DEFAULT_TARGETING_KEY,
      creationDate: Math.floor(Date.now() / 1000),
      // No `version`: the error stage receives no resolution metadata to read it from.
      source: 'INPROCESS',
    };

    this.eventPublisher.addEvent(eventToPublish);
  }
}

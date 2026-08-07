import type { Hook, HookContext, EvaluationDetails, JsonValue } from '@openfeature/server-sdk';
import type { IEvaluator } from '../evaluator/evaluator';
import type { EventPublisher } from '../service/event-publisher';
import type { FeatureEvent } from '../model';
import { EvaluatorNotFoundException, EventPublisherNotFoundException } from '../exception';
import { getContextKind } from '../helper/event-util';
import { DEFAULT_TARGETING_KEY } from '../helper/constants';

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

    const eventToPublish: FeatureEvent = {
      contextKind: getContextKind(context.context),
      kind: 'feature',
      creationDate: Math.floor(Date.now() / 1000),
      default: false,
      key: context.flagKey,
      value: details.value,
      variation: details.variant ?? 'SdkDefault',
      userKey: context.context?.targetingKey ?? DEFAULT_TARGETING_KEY,
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
    };

    this.eventPublisher.addEvent(eventToPublish);
  }
}

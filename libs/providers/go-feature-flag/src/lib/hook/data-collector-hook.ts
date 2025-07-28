import type { Hook, HookContext, EvaluationDetails, JsonValue } from '@openfeature/server-sdk';
import type { IEvaluator } from '../evaluator/evaluator';
import type { EventPublisher } from '../service/event-publisher';
import type { FeatureEvent } from '../model';
import { EvaluatorNotFoundException, EventPublisherNotFoundException } from '../exception';
import { getContextKind } from '../helper/event-util';
import { DEFAULT_TARGETING_KEY } from '../helper/constants';

/**
 * DataCollectorHook is a hook that collects data during the evaluation of feature flags.
 */
export class DataCollectorHook implements Hook {
  private readonly evaluator: IEvaluator;
  private readonly eventPublisher: EventPublisher;

  /**
   * DataCollectorHook is a hook that collects data during the evaluation of feature flags.
   * @param evaluator - service to evaluate the flag
   * @param eventPublisher - service to publish events
   * @throws Error if evaluator or eventPublisher is null
   */
  constructor(evaluator: IEvaluator, eventPublisher: EventPublisher) {
    if (!evaluator) {
      throw new EvaluatorNotFoundException('Evaluator cannot be null');
    }
    if (!eventPublisher) {
      throw new EventPublisherNotFoundException('EventPublisher cannot be null');
    }
    this.evaluator = evaluator;
    this.eventPublisher = eventPublisher;
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
    if (!this.evaluator.isFlagTrackable(context.flagKey)) {
      // If the flag is not trackable, we do not need to collect data.
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
    if (!this.evaluator.isFlagTrackable(context.flagKey)) {
      // If the flag is not trackable, we do not need to collect data.
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

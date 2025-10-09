import type { EvaluationDetails, FlagValue, HookContext, Logger, TelemetryAttribute } from '@openfeature/core';
import { createEvaluationEvent } from '@openfeature/core';
import type { Attributes } from '@opentelemetry/api';

type EvaluationEvent = { name: string; attributes: Attributes };
type TelemetryAttributesNames = [keyof typeof TelemetryAttribute][number] | string;

export type AttributeMapper = (
  hookContext: HookContext,
  evaluationDetails?: EvaluationDetails<FlagValue>,
) => Attributes;

export type EventMutator = (event: EvaluationEvent) => EvaluationEvent;

export type OpenTelemetryHookOptions = {
  /**
   * A function that allows mapping OpenFeature hook context values and
   * evaluation details to OpenTelemetry attributes.
   * This can be used to add custom attributes to the telemetry event.
   * Note: This function is applied after the excludeAttributes option.
   */
  attributeMapper?: AttributeMapper;

  /**
   * Exclude specific attributes from being added to the telemetry event.
   * This is useful for excluding sensitive information, or reducing the size of the event.
   * By default, no attributes are excluded.
   * Note: This option is applied before the attributeMapper and eventMutator options.
   */
  excludeAttributes?: TelemetryAttributesNames[];

  /**
   * If true, unhandled error or promise rejection during flag resolution, or any attached hooks
   * will not be recorded on the active span.
   * By default, exceptions are recorded on the active span, if there is one.
   */
  excludeExceptions?: boolean;

  /**
   * Takes a telemetry event and returns a telemetry event.
   * This can be used to filter out attributes that are not needed or to add additional attributes.
   * Note: This function is applied after the attributeMapper and excludeAttributes options.
   */
  eventMutator?: EventMutator;
};

/**
 * Base class that does some logging and safely wraps the AttributeMapper.
 */
export abstract class OpenTelemetryHook {
  protected abstract name: string;

  protected attributesToExclude: TelemetryAttributesNames[];
  protected excludeExceptions: boolean;
  protected safeAttributeMapper: AttributeMapper;
  protected safeEventMutator: EventMutator;

  protected constructor(options?: OpenTelemetryHookOptions, logger?: Logger) {
    this.safeAttributeMapper = (hookContext: HookContext, evaluationDetails?: EvaluationDetails<FlagValue>) => {
      try {
        return options?.attributeMapper?.(hookContext, evaluationDetails) || {};
      } catch (err) {
        logger?.debug(`${this.name}: error in attributeMapper, ${err.message}, ${err.stack}`);
        return {};
      }
    };
    this.safeEventMutator = (event: EvaluationEvent) => {
      try {
        return options?.eventMutator?.(event) ?? event;
      } catch (err) {
        logger?.debug(`${this.name}: error in eventMutator, ${err.message}, ${err.stack}`);
        return event;
      }
    };
    this.attributesToExclude = options?.excludeAttributes ?? [];
    this.excludeExceptions = options?.excludeExceptions ?? false;
  }

  protected toEvaluationEvent(
    hookContext: Readonly<HookContext>,
    evaluationDetails: EvaluationDetails<FlagValue>,
  ): EvaluationEvent {
    const { name, attributes } = createEvaluationEvent(hookContext, evaluationDetails);
    const customAttributes = this.safeAttributeMapper(hookContext, evaluationDetails);

    for (const attributeToExclude of this.attributesToExclude) {
      delete attributes[attributeToExclude];
    }

    return this.safeEventMutator({
      name,
      attributes: { ...attributes, ...customAttributes },
    });
  }
}

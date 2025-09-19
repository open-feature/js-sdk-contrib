import type { BaseHook, HookContext, EvaluationDetails, FlagValue, Logger } from '@openfeature/core';
import { trace } from '@opentelemetry/api';
import {
  FEATURE_FLAG,
  KEY_ATTR,
  PROVIDER_NAME_ATTR,
  RESULT_REASON_ATTR,
  RESULT_VARIANT_ATTR,
  RESULT_VALUE_ATTR,
  ALL_EVENT_ATTRS,
  ERROR_TYPE_ATTR,
  ERROR_MESSAGE_ATTR,
} from '../conventions';
import type { TracingEventAttributeKey, TracingEvent } from '../conventions';
import type { OpenTelemetryHookOptions } from '../otel-hook';
import { OpenTelemetryHook } from '../otel-hook';

export type TracingHookOptions = {
  /**
   * List of attribute keys to include in the span event. Defaults to all except RESULT_VALUE_ATTR.
   */
  includeAttributes?: TracingEventAttributeKey[];
} & OpenTelemetryHookOptions;

/**
 * A hook that adds conventionally-compliant span events to feature flag evaluations.
 *
 * See {@link https://opentelemetry.io/docs/specs/semconv/feature-flags/feature-flags-logs/}l
 */
export class TracingHook extends OpenTelemetryHook implements BaseHook {
  protected name = TracingHook.name;
  private readonly includeAttributes: string[];

  constructor(options?: TracingHookOptions, logger?: Logger) {
    super(options, logger);
    this.includeAttributes = options?.includeAttributes ?? ALL_EVENT_ATTRS.filter((attr) => attr !== RESULT_VALUE_ATTR);
  }

  after(hookContext: HookContext, evaluationDetails: EvaluationDetails<FlagValue>) {
    const currentTrace = trace.getActiveSpan();
    if (!currentTrace) {
      return;
    }

    const event: TracingEvent = {
      [KEY_ATTR]: hookContext.flagKey,
      [RESULT_VARIANT_ATTR]: evaluationDetails.variant,
      [ERROR_TYPE_ATTR]: evaluationDetails.errorCode?.toLowerCase(),
      [ERROR_MESSAGE_ATTR]: evaluationDetails.errorMessage,
      [PROVIDER_NAME_ATTR]: hookContext.providerMetadata.name,
      [RESULT_REASON_ATTR]: evaluationDetails.reason,
    };

    if (evaluationDetails.value !== undefined) {
      event[RESULT_VALUE_ATTR] = evaluationDetails.value;
    }

    for (const attribute of Object.keys(event)) {
      if (!this.includeAttributes.includes(attribute)) {
        delete event[attribute];
      }
    }

    currentTrace.addEvent(FEATURE_FLAG, { ...event, ...this.safeAttributeMapper(evaluationDetails.flagMetadata) });
  }

  error(_: HookContext, err: Error) {
    trace.getActiveSpan()?.recordException(err);
  }
}

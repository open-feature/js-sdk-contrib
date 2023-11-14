import { Hook, HookContext, EvaluationDetails, FlagValue, Logger } from '@openfeature/server-sdk';
import { trace } from '@opentelemetry/api';
import { FEATURE_FLAG, KEY_ATTR, PROVIDER_NAME_ATTR, VARIANT_ATTR } from '../conventions';
import { OpenTelemetryHook, OpenTelemetryHookOptions } from '../otel-hook';

export type TracingHookOptions = OpenTelemetryHookOptions;

/**
 * A hook that adds conventionally-compliant span events to feature flag evaluations.
 *
 * See {@link https://opentelemetry.io/docs/reference/specification/trace/semantic_conventions/feature-flags/}
 */
export class TracingHook extends OpenTelemetryHook implements Hook {
  protected name = TracingHook.name;

  constructor(options?: TracingHookOptions, logger?: Logger) {
    super(options, logger);
  }

  after(hookContext: HookContext, evaluationDetails: EvaluationDetails<FlagValue>) {
    const currentTrace = trace.getActiveSpan();
    if (currentTrace) {
      let variant = evaluationDetails.variant;

      if (!variant) {
        if (typeof evaluationDetails.value === 'string') {
          variant = evaluationDetails.value;
        } else {
          variant = JSON.stringify(evaluationDetails.value);
        }
      }

      currentTrace.addEvent(FEATURE_FLAG, {
        [KEY_ATTR]: hookContext.flagKey,
        [PROVIDER_NAME_ATTR]: hookContext.providerMetadata.name,
        [VARIANT_ATTR]: variant,
        ...this.safeAttributeMapper(evaluationDetails.flagMetadata),
      });
    }
  }

  error(_: HookContext, err: Error) {
    trace.getActiveSpan()?.recordException(err);
  }
}

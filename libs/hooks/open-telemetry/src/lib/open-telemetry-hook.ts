import { Hook, HookContext, EvaluationDetails, FlagValue } from '@openfeature/js-sdk';
import { trace } from '@opentelemetry/api';

const eventName = 'feature_flag';
const SpanEventProperties = Object.freeze({
  FLAG_KEY: 'feature_flag.key',
  PROVIDER_NAME: 'feature_flag.provider_name',
  VARIANT: 'feature_flag.variant',
});

export class OpenTelemetryHook implements Hook {
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

      currentTrace.addEvent(eventName, {
        [SpanEventProperties.FLAG_KEY]: hookContext.flagKey,
        [SpanEventProperties.PROVIDER_NAME]: hookContext.providerMetadata.name,
        [SpanEventProperties.VARIANT]: variant,
      });
    }
  }

  error(_: HookContext, err: Error) {
    const currentTrace = trace.getActiveSpan();
    currentTrace?.recordException(err);
  }
}

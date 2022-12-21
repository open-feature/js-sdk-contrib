import { Hook, HookContext, EvaluationDetails, FlagValue } from '@openfeature/js-sdk';
import { trace } from '@opentelemetry/api';

const eventName = 'feature_flag';
const spanEventProperties = Object.freeze({
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
        [spanEventProperties.FLAG_KEY]: hookContext.flagKey,
        [spanEventProperties.PROVIDER_NAME]: hookContext.providerMetadata.name,
        [spanEventProperties.VARIANT]: variant,
      });
    }
  }

  error(_: HookContext, err: Error) {
    trace.getActiveSpan()?.recordException(err);
  }
}

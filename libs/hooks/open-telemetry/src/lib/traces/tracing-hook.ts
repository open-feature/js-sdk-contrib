import { Hook, HookContext, EvaluationDetails, FlagValue } from '@openfeature/js-sdk';
import { trace } from '@opentelemetry/api';
import { FEATURE_FLAG } from '../constants';

const spanEventProperties = Object.freeze({
  FLAG_KEY: `${FEATURE_FLAG}.key`,
  PROVIDER_NAME: `${FEATURE_FLAG}.provider_name`,
  VARIANT: `${FEATURE_FLAG}.variant`,
});

export class TracingHook implements Hook {
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

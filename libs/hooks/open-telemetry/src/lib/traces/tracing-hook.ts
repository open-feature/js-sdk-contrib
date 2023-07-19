import { Hook, HookContext, EvaluationDetails, FlagValue } from '@openfeature/js-sdk';
import { trace } from '@opentelemetry/api';
import { FEATURE_FLAG, KEY_ATTR, PROVIDER_NAME_ATTR, VARIANT_ATTR } from '../conventions';

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
        [KEY_ATTR]: hookContext.flagKey,
        [PROVIDER_NAME_ATTR]: hookContext.providerMetadata.name,
        [VARIANT_ATTR]: variant,
      });
    }
  }

  error(_: HookContext, err: Error) {
    trace.getActiveSpan()?.recordException(err);
  }
}

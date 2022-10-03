import {
  Hook,
  HookContext,
  EvaluationDetails,
  FlagValue,
} from '@openfeature/js-sdk';
import { Span, Tracer, trace } from '@opentelemetry/api';

const SpanProperties = Object.freeze({
  FLAG_KEY: 'feature_flag.flag_key',
  PROVIDER_NAME: 'feature_flag.provider_name',
  VARIANT: 'feature_flag.evaluated_variant',
  VALUE: 'feature_flag.evaluated_value',
});

export class OpenTelemetryHook implements Hook {
  private spanMap = new WeakMap<HookContext, Span>();
  private tracer: Tracer;

  constructor() {
    this.tracer = trace.getTracer(
      '@openfeature/open-telemetry-hook',
      '4.0.0' // x-release-please-version
    );
  }

  before(hookContext: HookContext) {
    const span = this.tracer.startSpan(
      `${hookContext.providerMetadata.name} ${hookContext.flagKey}`,
      {
        attributes: {
          [SpanProperties.FLAG_KEY]: hookContext.flagKey,
          [SpanProperties.PROVIDER_NAME]: hookContext.providerMetadata.name,
        },
      }
    );

    this.spanMap.set(hookContext, span);
  }

  after(
    hookContext: HookContext,
    evaluationDetails: EvaluationDetails<FlagValue>
  ) {
    if (evaluationDetails.variant) {
      this.spanMap
        .get(hookContext)
        ?.setAttribute(SpanProperties.VARIANT, evaluationDetails.variant);
    } else {
      const value =
        typeof evaluationDetails.value === 'string'
          ? evaluationDetails.value
          : JSON.stringify(evaluationDetails.value);
      this.spanMap.get(hookContext)?.setAttribute(SpanProperties.VALUE, value);
    }
  }

  error(hookContext: HookContext, err: Error) {
    this.spanMap.get(hookContext)?.recordException(err);
  }

  finally(hookContext: HookContext) {
    this.spanMap.get(hookContext)?.end();
  }
}

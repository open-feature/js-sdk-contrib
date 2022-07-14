import {
  Hook,
  HookContext,
  EvaluationDetails,
  FlagValue,
} from '@openfeature/nodejs-sdk';
import { Span, Tracer, trace } from '@opentelemetry/api';

const SpanProperties = Object.freeze({
  FLAG_KEY: 'feature_flag.flag_key',
  CLIENT_NAME: 'feature_flag.client.name',
  CLIENT_VERSION: 'feature_flag.client.version',
  PROVIDER_NAME: 'feature_flag.provider.name',
  VARIANT: 'feature_flag.evaluated.variant',
  VALUE: 'feature_flag.evaluated.value',
});

export class OpenTelemetryHook implements Hook {
  private spanMap = new WeakMap<HookContext, Span>();
  private tracer: Tracer;

  constructor(name: string, version?: string) {
    console.log('test');
    this.tracer = trace.getTracer(name, version);
  }

  before(hookContext: HookContext) {
    const span = this.tracer.startSpan(
      `feature flag - ${hookContext.flagValueType}`
    );

    span.setAttributes({
      [SpanProperties.FLAG_KEY]: hookContext.flagKey,
      [SpanProperties.CLIENT_NAME]: hookContext.clientMetadata.name,
      [SpanProperties.CLIENT_VERSION]: hookContext.clientMetadata.version,
      [SpanProperties.PROVIDER_NAME]: hookContext.providerMetadata.name,
    });

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
      this.spanMap
        .get(hookContext)
        ?.setAttribute(
          SpanProperties.VALUE,
          JSON.stringify(evaluationDetails.value)
        );
    }
  }

  error(hookContext: HookContext, err: Error) {
    this.spanMap.get(hookContext)?.recordException(err);
  }

  finally(hookContext: HookContext) {
    this.spanMap.get(hookContext)?.end();
  }
}

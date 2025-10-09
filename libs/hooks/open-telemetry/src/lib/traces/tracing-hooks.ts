import type { BaseHook, HookContext, EvaluationDetails, FlagValue, Logger } from '@openfeature/core';
import type { Attributes, Exception, Span } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';
import type { Logger as OTELLogger, LogRecord } from '@opentelemetry/api-logs';
import { logs } from '@opentelemetry/api-logs';
import {
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_STACKTRACE,
  ATTR_EXCEPTION_TYPE,
} from '@opentelemetry/semantic-conventions';
import type { OpenTelemetryHookOptions } from '../otel-hook';
import { OpenTelemetryHook } from '../otel-hook';
import type { SpanAttributesTracingHookData } from './tracing-hooks-internal';
import { HookContextSpanKey } from './tracing-hooks-internal';

const LIBRARY_NAME = '@openfeature/open-telemetry-hooks';
const LIBRARY_VERSION = '0.4.0'; //x-release-please-version

/**
 * A hook that logs evaluation events to OpenTelemetry using an EventLogger.
 * This is useful for exporting evaluation events to a backend that supports
 * OpenTelemetry events.
 */
export class EventHook extends OpenTelemetryHook implements BaseHook {
  protected name = EventHook.name;
  private eventLogger: OTELLogger;

  constructor(options?: OpenTelemetryHookOptions, logger?: Logger) {
    super(options, logger);
    this.eventLogger = logs.getLogger(LIBRARY_NAME, LIBRARY_VERSION);
  }

  finally(hookContext: Readonly<HookContext>, evaluationDetails: EvaluationDetails<FlagValue>) {
    const { name, attributes } = this.toEvaluationEvent(hookContext, evaluationDetails);
    this.eventLogger.emit({ eventName: name, attributes: attributes });
  }

  error(_: HookContext, err: Error) {
    if (!this.excludeExceptions) {
      this.eventLogger.emit(this.toExceptionLogEvent(err));
    }
  }

  /**
   * Converts an exception to an OpenTelemetry log event.
   * The event is compatible to https://opentelemetry.io/docs/specs/semconv/exceptions/exceptions-logs/
   * The mapping code is adapted from the OpenTelemetry JS SDK:
   * https://github.com/open-telemetry/opentelemetry-js/blob/09bf31eb966bab627e76a6c5c05c6e51ccd2f387/packages/opentelemetry-sdk-trace-base/src/Span.ts#L330
   * @private
   */
  private toExceptionLogEvent(exception: Exception): LogRecord {
    const attributes: Attributes = {};
    if (typeof exception === 'string') {
      attributes[ATTR_EXCEPTION_MESSAGE] = exception;
    } else if (exception) {
      if (exception.code) {
        attributes[ATTR_EXCEPTION_TYPE] = exception.code.toString();
      } else if (exception.name) {
        attributes[ATTR_EXCEPTION_TYPE] = exception.name;
      }
      if (exception.message) {
        attributes[ATTR_EXCEPTION_MESSAGE] = exception.message;
      }
      if (exception.stack) {
        attributes[ATTR_EXCEPTION_STACKTRACE] = exception.stack;
      }
    }

    return {
      eventName: 'exception',
      attributes,
    };
  }
}

/**
 * A hook that adds evaluation events to the current active span.
 * This is useful for associating evaluation events with a trace.
 * If there is no active span, the event is not logged.
 * Span events are being deprecated in favor of using log events.
 */
export class SpanEventHook extends OpenTelemetryHook implements BaseHook {
  protected name = SpanEventHook.name;

  constructor(options?: OpenTelemetryHookOptions, logger?: Logger) {
    super(options, logger);
  }

  finally(hookContext: Readonly<HookContext>, evaluationDetails: EvaluationDetails<FlagValue>) {
    const currentTrace = trace.getActiveSpan();
    if (!currentTrace) {
      return;
    }

    const { name, attributes } = this.toEvaluationEvent(hookContext, evaluationDetails);

    currentTrace.addEvent(name, attributes);
  }

  error(_: HookContext, err: Error) {
    if (!this.excludeExceptions) {
      trace.getActiveSpan()?.recordException(err);
    }
  }
}

const tracer = trace.getTracer(LIBRARY_NAME, LIBRARY_VERSION);

/**
 * A hook that creates a new span for each flag evaluation and sets the evaluation
 * details as span attributes.
 * This is useful for tracing flag evaluations as part of a larger trace.
 * If there is no active span, a new root span is created.
 */
export class SpanHook extends OpenTelemetryHook implements BaseHook {
  protected name = SpanHook.name;

  constructor(options?: OpenTelemetryHookOptions, logger?: Logger) {
    super(options, logger);
  }

  before(hookContext: HookContext<FlagValue, SpanAttributesTracingHookData>) {
    const evaluationSpan = tracer.startSpan('feature_flag.evaluation');
    hookContext.hookData.set(HookContextSpanKey, evaluationSpan);
  }

  finally(
    hookContext: Readonly<HookContext<FlagValue, SpanAttributesTracingHookData>>,
    evaluationDetails: EvaluationDetails<FlagValue>,
  ) {
    const currentSpan = hookContext.hookData.get(HookContextSpanKey);
    if (!currentSpan) {
      return;
    }

    const { attributes } = this.toEvaluationEvent(hookContext, evaluationDetails);

    currentSpan.setAttributes(attributes);
    currentSpan.end();
  }

  error(hookContext: Readonly<HookContext<FlagValue, SpanAttributesTracingHookData>>, err: Error) {
    if (!this.excludeExceptions) {
      const currentSpan = hookContext.hookData.get(HookContextSpanKey) ?? trace.getActiveSpan();
      currentSpan?.recordException(err);
    }
  }
}

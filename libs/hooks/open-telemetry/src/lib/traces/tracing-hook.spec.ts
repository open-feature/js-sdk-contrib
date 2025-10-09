import type { Tracer } from '@opentelemetry/api';
import { context, trace } from '@opentelemetry/api';
import { NodeTracerProvider, SimpleSpanProcessor, InMemorySpanExporter } from '@opentelemetry/sdk-trace-node';
import { logs } from '@opentelemetry/api-logs';
import { LoggerProvider, SimpleLogRecordProcessor, InMemoryLogRecordExporter } from '@opentelemetry/sdk-logs';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import type { SpanAttributesTracingHookData } from './tracing-hooks';
import { EventHook } from './tracing-hooks';
import { SpanEventHook, SpanHook } from './tracing-hooks';
import type { BaseHook, EvaluationDetails, FlagValue, HookContext } from '@openfeature/core';
import { StandardResolutionReasons } from '@openfeature/core';
import { MapHookData } from '@openfeature/core';
import {
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_STACKTRACE,
  ATTR_EXCEPTION_TYPE,
} from '@opentelemetry/semantic-conventions';

describe('OpenTelemetry Hooks', () => {
  let tracerProvider: NodeTracerProvider;
  let spanProcessor: SimpleSpanProcessor;
  let memorySpanExporter: InMemorySpanExporter;
  let tracer: Tracer;
  let contextManager: AsyncLocalStorageContextManager;

  let loggerProvider: LoggerProvider;
  let logProcessor: SimpleLogRecordProcessor;
  let memoryLogExporter: InMemoryLogRecordExporter;

  let hookContext: HookContext<FlagValue, SpanAttributesTracingHookData>;

  beforeAll(() => {
    memorySpanExporter = new InMemorySpanExporter();
    spanProcessor = new SimpleSpanProcessor(memorySpanExporter);
    tracerProvider = new NodeTracerProvider({ spanProcessors: [spanProcessor] });
    contextManager = new AsyncLocalStorageContextManager().enable();
    context.setGlobalContextManager(contextManager);
    trace.setGlobalTracerProvider(tracerProvider);
    tracer = tracerProvider.getTracer('test');

    memoryLogExporter = new InMemoryLogRecordExporter();
    logProcessor = new SimpleLogRecordProcessor(memoryLogExporter);
    loggerProvider = new LoggerProvider({ processors: [logProcessor] });
    logs.setGlobalLoggerProvider(loggerProvider);

    hookContext = {
      clientMetadata: { providerMetadata: { name: 'test-provider' }, domain: 'test-client' },
      providerMetadata: { name: 'test-provider' },
      flagKey: 'flag',
      flagValueType: 'boolean',
      defaultValue: true,
      context: { targetingKey: 'user_id' },
      logger: console,
      hookData: new MapHookData(),
    };
  });

  afterEach(() => {
    memorySpanExporter.reset();
    memoryLogExporter.reset();
    contextManager.disable();
    contextManager.enable();
    hookContext.hookData.clear();
  });

  describe('EventHook', () => {
    it('should log an evaluation event', () => {
      const hook: BaseHook = new EventHook();
      const details: EvaluationDetails<boolean> = {
        flagKey: 'flag',
        variant: 'on',
        value: true,
        flagMetadata: {},
        reason: StandardResolutionReasons.TARGETING_MATCH,
      };

      hook.before?.(hookContext);
      hook.after?.(hookContext, details);
      hook.finally?.(hookContext, details);

      const finished = memoryLogExporter.getFinishedLogRecords();
      expect(finished.length).toBe(1);
      const logRecord = finished[0];

      expect(logRecord.eventName).toEqual('feature_flag.evaluation');
      expect(logRecord.attributes).toEqual(
        expect.objectContaining({
          'feature_flag.key': hookContext.flagKey,
          'feature_flag.provider.name': hookContext.providerMetadata.name,
          'feature_flag.result.reason': details.reason?.toLocaleLowerCase(),
          'feature_flag.result.value': details.value,
          'feature_flag.result.variant': details.variant,
        }),
      );
    });

    it('should log exception on error', () => {
      const hook: BaseHook = new EventHook();
      const error = new Error('fail');
      const details: EvaluationDetails<boolean> = {
        flagKey: 'flag',
        variant: 'on',
        value: true,
        flagMetadata: {},
        reason: StandardResolutionReasons.TARGETING_MATCH,
      };

      hook.before?.(hookContext);
      hook.error?.(hookContext, error);
      hook.finally?.(hookContext, details);

      const finished = memoryLogExporter.getFinishedLogRecords();
      expect(finished.length).toBe(2);
      const logRecord = finished[0];

      expect(logRecord.eventName).toEqual('exception');
      expect(logRecord.attributes).toEqual({
        [ATTR_EXCEPTION_TYPE]: error.name,
        [ATTR_EXCEPTION_MESSAGE]: error.message,
        [ATTR_EXCEPTION_STACKTRACE]: error.stack,
      });
    });

    describe('OpenTelemetryHookOptions', () => {
      const details: EvaluationDetails<boolean> = {
        flagKey: 'flag',
        variant: 'on',
        value: true,
        flagMetadata: { foo: 'bar', secret: 'shouldBeExcluded' },
        reason: StandardResolutionReasons.TARGETING_MATCH,
      };

      it('should add custom attribute via attributeMapper', () => {
        const hook: BaseHook = new EventHook({
          attributeMapper: (context, evalDetails) => ({
            key: context.context?.targetingKey,
            custom: evalDetails.flagMetadata.foo,
          }),
        });
        hook.before?.(hookContext);
        hook.after?.(hookContext, details);
        hook.finally?.(hookContext, details);
        const finished = memoryLogExporter.getFinishedLogRecords();
        expect(finished[0]?.attributes?.custom).toBe('bar');
        expect(finished[0]?.attributes?.key).toBe('user_id');
      });

      it('should exclude attribute via excludeAttributes', () => {
        const hook: BaseHook = new EventHook({
          excludeAttributes: ['secret'],
        });
        hook.before?.(hookContext);
        hook.after?.(hookContext, details);
        hook.finally?.(hookContext, details);
        const finished = memoryLogExporter.getFinishedLogRecords();
        expect(finished[0]?.attributes?.secret).toBeUndefined();
      });

      it('should mutate event via eventMutator', () => {
        const hook: BaseHook = new EventHook({
          eventMutator: (event) => ({ ...event, attributes: { ...event.attributes, mutated: true } }),
        });
        hook.before?.(hookContext);
        hook.after?.(hookContext, details);
        hook.finally?.(hookContext, details);
        const finished = memoryLogExporter.getFinishedLogRecords();
        expect(finished[0]?.attributes?.mutated).toBe(true);
      });

      it('should not log exception if excludeExceptions is true', () => {
        const hook: BaseHook = new EventHook({ excludeExceptions: true });
        const error = new Error('fail');
        hook.before?.(hookContext);
        hook.error?.(hookContext, error);
        hook.finally?.(hookContext, details);
        const finished = memoryLogExporter.getFinishedLogRecords();
        // Should not log exception event, only the finally evaltion event
        expect(finished.length).toBe(1);
      });
    });
  });

  describe('SpanEventHook', () => {
    it('should add an event to the active span', () => {
      const hook: BaseHook = new SpanEventHook();
      const details: EvaluationDetails<boolean> = {
        flagKey: 'flag',
        variant: 'on',
        value: true,
        flagMetadata: {},
        reason: StandardResolutionReasons.TARGETING_MATCH,
      };

      const span = tracer.startSpan('test-span');
      context.with(trace.setSpan(context.active(), span), () => {
        hook.before?.(hookContext);
        hook.after?.(hookContext, details);
        hook.finally?.(hookContext, details);
        span.end();
      });
      const finished = memorySpanExporter.getFinishedSpans();
      expect(finished.length).toBe(1);
      const events = finished[0].events;
      expect(events.length).toBe(1);

      expect(events[0].name).toEqual('feature_flag.evaluation');
      expect(events[0].attributes).toEqual(
        expect.objectContaining({
          'feature_flag.key': hookContext.flagKey,
          'feature_flag.provider.name': hookContext.providerMetadata.name,
          'feature_flag.result.reason': details.reason?.toLocaleLowerCase(),
          'feature_flag.result.value': details.value,
          'feature_flag.result.variant': details.variant,
        }),
      );
    });

    it('should record exception on error', () => {
      const hook: BaseHook = new SpanEventHook();
      const error = new Error('fail');
      const span = tracer.startSpan('test-span');
      context.with(trace.setSpan(context.active(), span), () => {
        hook.before?.(hookContext);
        hook.error?.(hookContext, error);
        span.end();
      });
      const finished = memorySpanExporter.getFinishedSpans();
      expect(finished.length).toBe(1);

      const events = finished[0].events;
      expect(events.length).toBe(1);

      expect(events[0].name).toEqual('exception');
      expect(events[0].attributes).toEqual({
        [ATTR_EXCEPTION_TYPE]: error.name,
        [ATTR_EXCEPTION_MESSAGE]: error.message,
        [ATTR_EXCEPTION_STACKTRACE]: error.stack,
      });
    });

    describe('OpenTelemetryHookOptions', () => {
      const details: EvaluationDetails<boolean> = {
        flagKey: 'flag',
        variant: 'on',
        value: true,
        flagMetadata: { foo: 'bar', secret: 'shouldBeExcluded' },
        reason: StandardResolutionReasons.TARGETING_MATCH,
      };

      it('should add custom attribute via attributeMapper', () => {
        const hook: BaseHook = new SpanEventHook({
          attributeMapper: (context, evalDetails) => ({
            key: context.context?.targetingKey,
            custom: evalDetails.flagMetadata.foo,
          }),
        });
        const span = tracer.startSpan('test-span');
        context.with(trace.setSpan(context.active(), span), () => {
          hook.before?.(hookContext);
          hook.after?.(hookContext, details);
          hook.finally?.(hookContext, details);
          span.end();
        });
        const finished = memorySpanExporter.getFinishedSpans();
        const attrs = finished[0].events[0].attributes;
        expect(attrs?.custom).toBe('bar');
        expect(attrs?.key).toBe('user_id');
      });

      it('should exclude attribute via excludeAttributes', () => {
        const hook: BaseHook = new SpanEventHook({
          excludeAttributes: ['secret'],
        });
        const span = tracer.startSpan('test-span');
        context.with(trace.setSpan(context.active(), span), () => {
          hook.before?.(hookContext, details);
          hook.after?.(hookContext, details);
          hook.finally?.(hookContext, details);
          span.end();
        });
        const finished = memorySpanExporter.getFinishedSpans();
        const attrs = finished[0].events[0].attributes;
        expect(attrs?.secret).toBeUndefined();
      });

      it('should mutate event via eventMutator', () => {
        const hook: BaseHook = new SpanEventHook({
          eventMutator: (event) => ({ ...event, attributes: { ...event.attributes, mutated: true } }),
        });
        const span = tracer.startSpan('test-span');
        context.with(trace.setSpan(context.active(), span), () => {
          hook.finally?.(hookContext, details);
          span.end();
        });
        const finished = memorySpanExporter.getFinishedSpans();
        const attrs = finished[0].events[0].attributes;
        expect(attrs?.mutated).toBe(true);
      });

      it('should not record exception if excludeExceptions is true', () => {
        const hook: BaseHook = new SpanEventHook({ excludeExceptions: true });
        const error = new Error('fail');
        const span = tracer.startSpan('test-span');
        context.with(trace.setSpan(context.active(), span), () => {
          hook.before?.(hookContext);
          hook.error?.(hookContext, error);
          span.end();
        });
        const finished = memorySpanExporter.getFinishedSpans();
        // Should not record exception event
        expect(finished[0].events.length).toBe(0);
      });
    });
  });

  describe('SpanHook', () => {
    it('should create a span for evaluation and set attributes', () => {
      const hook: BaseHook = new SpanHook();
      const details: EvaluationDetails<boolean> = {
        flagKey: 'flag',
        variant: 'on',
        value: true,
        flagMetadata: {},
        reason: StandardResolutionReasons.TARGETING_MATCH,
      };

      const span = tracer.startSpan('test-span');
      context.with(trace.setSpan(context.active(), span), () => {
        hook.before?.(hookContext);
        hook.after?.(hookContext, details);
        hook.finally?.(hookContext, details);
        span.end();
      });
      const finished = memorySpanExporter.getFinishedSpans();
      expect(finished.length).toBe(2); // One for evaluation, one for test-span
      const finishedSpan = finished[0]; // The evaluation span is ended first

      expect(finishedSpan.name).toEqual('feature_flag.evaluation');
      expect(finishedSpan.attributes).toEqual(
        expect.objectContaining({
          'feature_flag.key': hookContext.flagKey,
          'feature_flag.provider.name': hookContext.providerMetadata.name,
          'feature_flag.result.reason': details.reason?.toLocaleLowerCase(),
          'feature_flag.result.value': details.value,
          'feature_flag.result.variant': details.variant,
        }),
      );
    });

    it('should create a span and record exception on error', () => {
      const hook: BaseHook = new SpanHook();

      const error = new Error('fail');
      const details: EvaluationDetails<boolean> = {
        flagKey: 'flag',
        variant: 'on',
        value: true,
        flagMetadata: {},
        reason: StandardResolutionReasons.TARGETING_MATCH,
      };

      const span = tracer.startSpan('test-span');
      context.with(trace.setSpan(context.active(), span), () => {
        hook.before?.(hookContext);
        hook.error?.(hookContext, error);
        hook.finally?.(hookContext, details);
        span.end();
      });

      const finished = memorySpanExporter.getFinishedSpans();
      expect(finished.length).toBe(2); // One for evaluation, one for test-span
      const finishedSpan = finished[0]; // The evaluation span is ended first
      expect(finishedSpan.name).toEqual('feature_flag.evaluation');

      const events = finishedSpan.events;
      expect(events.length).toBe(1);

      expect(events[0].name).toEqual('exception');
      expect(events[0].attributes).toEqual({
        [ATTR_EXCEPTION_TYPE]: error.name,
        [ATTR_EXCEPTION_MESSAGE]: error.message,
        [ATTR_EXCEPTION_STACKTRACE]: error.stack,
      });
    });

    describe('OpenTelemetryHookOptions', () => {
      const details: EvaluationDetails<boolean> = {
        flagKey: 'flag',
        variant: 'on',
        value: true,
        flagMetadata: { foo: 'bar', secret: 'shouldBeExcluded' },
        reason: StandardResolutionReasons.TARGETING_MATCH,
      };

      it('should add custom attribute via attributeMapper', () => {
        const hook: BaseHook = new SpanHook({
          attributeMapper: (context, evalDetails) => ({
            key: context.context?.targetingKey,
            custom: evalDetails.flagMetadata.foo,
          }),
        });

        const span = tracer.startSpan('test-span');
        context.with(trace.setSpan(context.active(), span), () => {
          hook.before?.(hookContext);
          hook.after?.(hookContext, details);
          hook.finally?.(hookContext, details);
          span.end();
        });
        const finished = memorySpanExporter.getFinishedSpans();
        const evalSpan = finished[0];
        expect(evalSpan.attributes?.custom).toBe('bar');
        expect(evalSpan.attributes?.custom).toBe('user_id');
      });

      it('should exclude attribute via excludeAttributes', () => {
        const hook: BaseHook = new SpanHook({
          excludeAttributes: ['secret'],
        });
        const span = tracer.startSpan('test-span');
        context.with(trace.setSpan(context.active(), span), () => {
          hook.before?.(hookContext);
          hook.after?.(hookContext, details);
          hook.finally?.(hookContext, details);
          span.end();
        });
        const finished = memorySpanExporter.getFinishedSpans();
        const evalSpan = finished[0];
        expect(evalSpan.attributes?.secret).toBeUndefined();
      });

      it('should mutate event via eventMutator', () => {
        const hook: BaseHook = new SpanHook({
          eventMutator: (event) => ({ ...event, attributes: { ...event.attributes, mutated: true } }),
        });
        const span = tracer.startSpan('test-span');
        context.with(trace.setSpan(context.active(), span), () => {
          hook.before?.(hookContext);
          hook.after?.(hookContext, details);
          hook.finally?.(hookContext, details);
          span.end();
        });
        const finished = memorySpanExporter.getFinishedSpans();
        const evalSpan = finished[0];
        expect(evalSpan.attributes?.mutated).toBe(true);
      });

      it('should not record exception if excludeExceptions is true', () => {
        const hook: BaseHook = new SpanHook({ excludeExceptions: true });
        const error = new Error('fail');
        const span = tracer.startSpan('test-span');
        context.with(trace.setSpan(context.active(), span), () => {
          hook.before?.(hookContext);
          hook.error?.(hookContext, error);
          hook.finally?.(hookContext, details);
          span.end();
        });
        const finished = memorySpanExporter.getFinishedSpans();
        const evalSpan = finished[0];
        // Should not record exception event
        expect(evalSpan.events.length).toBe(0);
      });
    });
  });
});

import type { Span } from '@opentelemetry/api';

export const HookContextSpanKey = Symbol('evaluation_span');
export type SpanAttributesTracingHookData = { [HookContextSpanKey]: Span };

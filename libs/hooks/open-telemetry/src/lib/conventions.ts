// see: https://opentelemetry.io/docs/specs/otel/logs/semantic_conventions/feature-flags/
import type { FlagValue } from '@openfeature/core';
import type { AttributeValue } from '@opentelemetry/api';

export const FEATURE_FLAG = 'feature_flag';
export const EXCEPTION_ATTR = 'exception';

export const ACTIVE_COUNT_NAME = `${FEATURE_FLAG}.evaluation_active_count`;
export const REQUESTS_TOTAL_NAME = `${FEATURE_FLAG}.evaluation_requests_total`;
export const SUCCESS_TOTAL_NAME = `${FEATURE_FLAG}.evaluation_success_total`;
export const ERROR_TOTAL_NAME = `${FEATURE_FLAG}.evaluation_error_total`;

export type EvaluationAttributes = { [key: `${typeof FEATURE_FLAG}.${string}`]: string | undefined };
export type ExceptionAttributes = { [EXCEPTION_ATTR]: string };

export const KEY_ATTR = `${FEATURE_FLAG}.key` as const;
export const RESULT_VARIANT_ATTR = `${FEATURE_FLAG}.result.variant` as const;
export const RESULT_VALUE_ATTR = `${FEATURE_FLAG}.result.value` as const;
export const RESULT_REASON_ATTR = `${FEATURE_FLAG}.result.reason` as const;
export const ERROR_TYPE_ATTR = `${FEATURE_FLAG}.error.type` as const;
export const ERROR_MESSAGE_ATTR = `${FEATURE_FLAG}.error.message` as const;
export const CONTEXT_ID_ATTR = `${FEATURE_FLAG}.context.id` as const;
export const PROVIDER_NAME_ATTR = `${FEATURE_FLAG}.provider.name` as const;
export const SET_ID_ATTR = `${FEATURE_FLAG}.set.name` as const;
export const VERSION_ATTR = `${FEATURE_FLAG}.version` as const;

export const ALL_EVENT_ATTRS = [
  KEY_ATTR,
  PROVIDER_NAME_ATTR,
  RESULT_VARIANT_ATTR,
  RESULT_VALUE_ATTR,
  RESULT_REASON_ATTR,
  ERROR_TYPE_ATTR,
  ERROR_MESSAGE_ATTR,
  CONTEXT_ID_ATTR,
  SET_ID_ATTR,
  VERSION_ATTR,
];

export type TracingEventAttributeKey = (typeof ALL_EVENT_ATTRS)[number];

export type TracingEvent = {
  [K in Exclude<TracingEventAttributeKey, 'feature_flag.key' | 'feature_flag.result.value'>]?: string;
} & {
  [KEY_ATTR]: string;
  [RESULT_VALUE_ATTR]?: FlagValue;
} & { [key: string]: AttributeValue | undefined };

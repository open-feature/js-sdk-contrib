// see: https://opentelemetry.io/docs/specs/otel/logs/semantic_conventions/feature-flags/
export const FEATURE_FLAG = 'feature_flag';

export const ACTIVE_COUNT_NAME = `${FEATURE_FLAG}.evaluation_active_count`;
export const REQUESTS_TOTAL_NAME = `${FEATURE_FLAG}.evaluation_requests_total`;
export const SUCCESS_TOTAL_NAME = `${FEATURE_FLAG}.evaluation_success_total`;
export const ERROR_TOTAL_NAME = `${FEATURE_FLAG}.evaluation_error_total`;

export type EvaluationAttributes = {[key: `${typeof FEATURE_FLAG}.${string}`]: string | undefined };
export type ExceptionAttribute = { [key in `${typeof FEATURE_FLAG}.exception`]: string };

export const KEY_ATTR: keyof EvaluationAttributes = `${FEATURE_FLAG}.key`;
export const PROVIDER_NAME_ATTR: keyof EvaluationAttributes = `${FEATURE_FLAG}.provider_name`;
export const VARIANT_ATTR: keyof EvaluationAttributes = `${FEATURE_FLAG}.variant`;
export const REASON_ATTR: keyof EvaluationAttributes = `${FEATURE_FLAG}.reason`;
export const ERROR_ATTR: keyof ExceptionAttribute = `${FEATURE_FLAG}.exception`;
export const FEATURE_FLAG = 'feature_flag';
export const EXCEPTION_ATTR = 'exception';

export const ACTIVE_COUNT_NAME = `${FEATURE_FLAG}.evaluation_active_count`;
export const REQUESTS_TOTAL_NAME = `${FEATURE_FLAG}.evaluation_requests_total`;
export const SUCCESS_TOTAL_NAME = `${FEATURE_FLAG}.evaluation_success_total`;
export const ERROR_TOTAL_NAME = `${FEATURE_FLAG}.evaluation_error_total`;

export type EvaluationAttributes = { [key: `${typeof FEATURE_FLAG}.${string}`]: string | undefined };
export type ExceptionAttributes = { [EXCEPTION_ATTR]: string };

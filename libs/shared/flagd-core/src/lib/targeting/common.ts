import type { EvaluationContext, Logger } from '@openfeature/core';

export const flagdPropertyKey = '$flagd';
export const flagKeyPropertyKey = 'flagKey';
export const timestampPropertyKey = 'timestamp';
export const targetingPropertyKey = 'targetingKey';
export const loggerSymbol = Symbol.for('flagd.logger');

export type EvaluationContextWithLogger = EvaluationContext & { [loggerSymbol]: Logger };

export function getLoggerFromContext(context: EvaluationContextWithLogger): Logger {
  const logger = context[loggerSymbol];
  if (!logger) {
    throw new Error('Logger not found in context');
  }
  return logger;
}

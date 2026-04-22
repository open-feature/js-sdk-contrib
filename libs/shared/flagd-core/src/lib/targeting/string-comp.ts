import { getLoggerFromContext } from './common';
import type { EvaluationContextWithLogger } from './common';

export const startsWithRule = 'starts_with';
export const endsWithRule = 'ends_with';

export function startsWith(data: unknown, context: EvaluationContextWithLogger) {
  return compare(startsWithRule, data, context);
}

export function endsWith(data: unknown, context: EvaluationContextWithLogger) {
  return compare(endsWithRule, data, context);
}

function compare(method: string, data: unknown, context: EvaluationContextWithLogger): boolean | null {
  const logger = getLoggerFromContext(context);
  if (!Array.isArray(data)) {
    logger.debug('Invalid comparison configuration: input is not an array');
    return null;
  }

  if (data.length != 2) {
    logger.debug(`Invalid comparison configuration: invalid array length ${data.length}`);
    return null;
  }

  if (typeof data[0] !== 'string' || typeof data[1] !== 'string') {
    logger.debug('Invalid comparison configuration: array values are not strings');
    return null;
  }

  switch (method) {
    case startsWithRule:
      return data[0].startsWith(data[1]);
    case endsWithRule:
      return data[0].endsWith(data[1]);
    default:
      logger.debug(`Invalid comparison configuration: Invalid method '${method}'`);
      return null;
  }
}

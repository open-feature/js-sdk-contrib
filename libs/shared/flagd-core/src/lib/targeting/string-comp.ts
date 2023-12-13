import { type Logger } from '@openfeature/core';

export const startsWithRule = 'starts_with';
export const endsWithRule = 'ends_with';

export function stringCompareFactory(logger: Logger) {
  function startsWithHandler(data: unknown) {
    return compare(startsWithRule, data);
  }

  function endsWithHandler(data: unknown) {
    return compare(endsWithRule, data);
  }

  function compare(method: string, data: unknown): boolean {
    if (!Array.isArray(data)) {
      logger.debug('Invalid comparison configuration: input is not an array');
      return false;
    }

    if (data.length != 2) {
      logger.debug(`Invalid comparison configuration: invalid array length ${data.length}`);
      return false;
    }

    if (typeof data[0] !== 'string' || typeof data[1] !== 'string') {
      logger.debug('Invalid comparison configuration: array values are not strings');
      return false;
    }

    switch (method) {
      case startsWithRule:
        return data[0].startsWith(data[1]);
      case endsWithRule:
        return data[0].endsWith(data[1]);
      default:
        logger.debug(`Invalid comparison configuration: Invalid method '${method}'`);
        return false;
    }
  }

  return {
    startsWithHandler,
    endsWithHandler,
  };
}

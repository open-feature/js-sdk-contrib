import type { Logger } from '@openfeature/core';
import { compare, parse } from 'semver';

export const semVerRule = 'sem_ver';

export function semVerFactory(logger: Logger) {
  return function semVer(data: unknown): boolean {
    if (!Array.isArray(data)) {
      logger.debug(`Invalid ${semVerRule} configuration: Expected an array`);
      return false;
    }

    const args = Array.from(data);

    if (args.length != 3) {
      logger.debug(`Invalid ${semVerRule} configuration: Expected 3 arguments, got ${args.length}`);
      return false;
    }

    const semVer1 = parse(args[0]);
    const semVer2 = parse(args[2]);

    if (!semVer1 || !semVer2) {
      logger.debug(`Invalid ${semVerRule} configuration: Unable to parse semver`);
      return false;
    }

    const operator = String(args[1]);
    const result = compare(semVer1, semVer2);

    switch (operator) {
      case '=':
        return result == 0;
      case '!=':
        return result != 0;
      case '<':
        return result < 0;
      case '<=':
        return result <= 0;
      case '>=':
        return result >= 0;
      case '>':
        return result > 0;
      case '^':
        return semVer1.major == semVer2.major;
      case '~':
        return semVer1.major == semVer2.major && semVer1.minor == semVer2.minor;
    }

    return false;
  };
}

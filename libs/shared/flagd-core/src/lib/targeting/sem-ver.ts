import { compare, coerce, parse } from 'semver';
import type { SemVer } from 'semver';
import { getLoggerFromContext } from './common';
import type { EvaluationContextWithLogger } from './common';

export const semVerRule = 'sem_ver';

/**
 * Parse a version string with lenient handling:
 * - strips v/V prefix
 * - coerces partial versions (e.g. "1", "1.0")
 * - converts numeric inputs to strings
 *
 * Returns null for truly invalid versions (e.g. "not-a-version", "2.0.0.0").
 */
function normalizeVersion(raw: unknown): SemVer | null {
  const str = String(raw).replace(/^[vV]/, '');
  const strict = parse(str);
  if (strict) {
    return strict;
  }
  // coerce partial versions like "1" or "1.2", but reject anything that
  // doesn't look like a numeric version (coerce is too aggressive otherwise;
  // e.g. it extracts "1" from "myVersion_1")
  if (/^\d+(\.\d+)?$/.test(str)) {
    return coerce(str);
  }
  return null;
}

export function semVer(data: unknown, context: EvaluationContextWithLogger): boolean | null {
  const logger = getLoggerFromContext(context);
  if (!Array.isArray(data)) {
    logger.debug(`Invalid ${semVerRule} configuration: Expected an array`);
    return null;
  }

  const args = Array.from(data);

  if (args.length != 3) {
    logger.debug(`Invalid ${semVerRule} configuration: Expected 3 arguments, got ${args.length}`);
    return null;
  }

  const semVer1 = normalizeVersion(args[0]);
  const semVer2 = normalizeVersion(args[2]);

  if (!semVer1 || !semVer2) {
    logger.debug(`Invalid ${semVerRule} configuration: Unable to parse semver`);
    return null;
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

  logger.debug(`Invalid ${semVerRule} configuration: Unknown operator '${operator}'`);
  return null;
}

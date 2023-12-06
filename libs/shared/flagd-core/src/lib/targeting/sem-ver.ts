import { compare, parse } from 'semver';

export const semVerRule = 'sem_ver';

export function semVer(...args: unknown[]): boolean {

  if (args.length != 3) {
    return false;
  }

  const semVertString1 = typeof args[0] === 'string' ? args[0] : undefined; 
  const semVertString2 = typeof args[2] === 'string' ? args[2] : undefined; 

  const semVer1 = parse(semVertString1);
  const semVer2 = parse(semVertString2);

  if (!semVer1 || !semVer2) {
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
}

export const startsWithRule = 'starts_with';
export const endsWithRule = 'ends_with';

export function startsWithHandler(...args: unknown[]) {
  return compare(startsWithRule, args);
}

export function endsWithHandler(...args: unknown[]) {
  return compare(endsWithRule, args);
}

function compare(method: string, args: unknown[]): boolean {
  if (!Array.isArray(args)) {
    return false;
  }

  if (args.length != 2) {
    return false;
  }

  if (typeof args[0] !== 'string' || typeof args[1] !== 'string') {
    return false;
  }

  switch (method) {
    case startsWithRule:
      return args[0].startsWith(args[1]);
    case endsWithRule:
      return args[0].endsWith(args[1]);
    default:
      return false;
  }
}

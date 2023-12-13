export const startsWithRule = 'starts_with';
export const endsWithRule = 'ends_with';

export function startsWithHandler(data: unknown) {
  return compare(startsWithRule, data);
}

export function endsWithHandler(data: unknown) {
  return compare(endsWithRule, data);
}

function compare(method: string, data: unknown): boolean {
  if (!Array.isArray(data)) {
    return false;
  }

  if (data.length != 2) {
    return false;
  }

  if (typeof data[0] !== 'string' || typeof data[1] !== 'string') {
    return false;
  }

  switch (method) {
    case startsWithRule:
      return data[0].startsWith(data[1]);
    case endsWithRule:
      return data[0].endsWith(data[1]);
    default:
      return false;
  }
}

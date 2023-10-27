export const startsWithRule = 'starts_with'
export const endsWithRule = 'ends_with'

export function startsWithHandler(data: unknown) {
  return compare(startsWithRule, data)
}

export function endsWithHandler(data: unknown) {
  return compare(endsWithRule, data)
}

function compare(method: string, data: unknown): boolean {
  if (!Array.isArray(data)) {
    return false;
  }

  const params = Array.from(data);

  if (params.length != 2) {
    return false
  }

  if (typeof params[0] != 'string' || typeof params[1] != 'string') {
    return false
  }

  switch (method) {
    case startsWithRule:
      return params[0].startsWith(params[1])
    case endsWithRule:
      return params[0].endsWith(params[1])
    default:
      return false
  }
}

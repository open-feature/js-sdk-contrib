const RetriableHttpStatusCodes = new Map<number, string>([
  [408, 'Request Timeout'],
  [429, 'Too Many Requests'],
  [500, 'Internal Server Error'],
  [502, 'Bad Gateway'],
  [503, 'Service Unavailable'],
  [504, 'Gateway Timeout'],
]);

export function shouldRetry(res: Response) {
  return !res.ok && RetriableHttpStatusCodes.has(res.status);
}

export function getRetryAfterMs(response: Response, receivedAtMs: number = Date.now()): number | undefined {
  const retryAfterHeaderValue = (response.headers.get('Retry-After') ?? '').trim();
  // Check for any empty value or negative number
  if (!retryAfterHeaderValue || retryAfterHeaderValue.startsWith('-')) return undefined;
  // Check if the header value is a valid number
  if (/^\d+$/.test(retryAfterHeaderValue)) {
    const retryAfterSeconds = parseInt(retryAfterHeaderValue, 10);
    return retryAfterSeconds * 1_000;
  }
  // Check if the header value is a valid HTTP Date
  const retryAfterHttpDate = Date.parse(retryAfterHeaderValue);
  return Number.isFinite(retryAfterHttpDate) ? Math.max(0, retryAfterHttpDate - receivedAtMs) : undefined;
}

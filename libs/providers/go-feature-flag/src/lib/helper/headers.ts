import { RESERVED_HEADERS } from './constants';

/**
 * Merges caller-supplied headers underneath the headers this provider owns.
 *
 * Two rules, and the difference between them matters:
 *
 * - Anything already in `owned` wins, so the provider's own value is never displaced. This is what
 *   protects `X-API-Key` while `apiKey` is set — and only while it is set, so a caller with no
 *   `apiKey` configured can supply their own.
 * - Names in {@link RESERVED_HEADERS} are dropped whether or not `owned` carries them, because
 *   they are transport details the caller must not reach at all.
 *
 * The comparison is case-insensitive, and that is load-bearing rather than tidiness: a `Record`
 * can hold `X-API-Key` and `x-api-key` as two distinct keys, and `fetch` comma-joins them into a
 * single header rather than picking one. A plain `{ ...custom, ...owned }` spread would therefore
 * let a lower-cased duplicate smuggle a second value onto the wire alongside the real one.
 * @param owned - the headers the provider is sending for this request
 * @param custom - headers supplied through the `headers` option
 * @returns the merged header map, with the provider's own entries intact
 */
export function buildRequestHeaders(
  owned: Record<string, string>,
  custom?: Record<string, string>,
): Record<string, string> {
  if (!custom) {
    return owned;
  }

  const reserved = new Set(RESERVED_HEADERS.map((name) => name.toLowerCase()));
  const ownedNames = new Set(Object.keys(owned).map((name) => name.toLowerCase()));

  // Null-prototype, for the same reason as `serializeFlags`: on a plain object literal an
  // assignment to `__proto__` hits the inherited setter and is discarded, so a caller header by
  // that name would go missing rather than be sent. The spread below copies the entries into an
  // ordinary object, so the return type and every call site are unchanged.
  const merged: Record<string, string> = Object.create(null);
  for (const name of Object.keys(custom)) {
    const lowered = name.toLowerCase();
    if (reserved.has(lowered) || ownedNames.has(lowered)) {
      continue;
    }
    // No emptiness check: an empty string is a legal header value, and `Object.keys` already
    // yields own enumerable names only, so there is nothing further to filter.
    merged[name] = custom[name];
  }

  return { ...merged, ...owned };
}

import { InvalidOptionsException } from '../exception';

/**
 * Rejects a configuration URL that is not absolute http(s).
 *
 * Shared by every option that is later concatenated into a request URL (`endpoint`,
 * `dataCollectorBaseURL`, …): catching a typo here means construction fails with this provider's
 * own exception rather than a late, generic failure once something tries to call `fetch`.
 *
 * @param name - option name used in the error message
 * @param value - candidate URL string
 * @throws {InvalidOptionsException} when `value` is not a valid http or https URL
 */
export function validateUrlOption(name: string, value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InvalidOptionsException(`${name} must be a valid URL (http or https)`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new InvalidOptionsException(`${name} must be a valid URL (http or https)`);
  }
}

/**
 * Strips trailing slashes from a base URL before path segments are appended.
 *
 * Without this, a configured `https://host/` plus `/v1/...` becomes `https://host//v1/...`.
 * The same rule applies to every option that is later used as a request base.
 *
 * @param url - base URL that may end in one or more `/`
 * @returns the URL with trailing slashes removed
 */
export function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, '');
}

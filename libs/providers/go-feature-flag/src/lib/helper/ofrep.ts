import { HTTP_HEADER_API_KEY } from './constants';
import { buildRequestHeaders } from './headers';

/**
 * The environment variables the OFREP delegate reads for itself.
 *
 * `getConfig` consults all three inside the `OFREPProvider` constructor, and merges the headers it
 * finds *underneath* the ones we pass — overriding only on key collision. Passing an explicit
 * `baseUrl` is therefore not enough on its own to keep the environment out of the configuration.
 */
export const OFREP_ENV_VARS = ['OFREP_ENDPOINT', 'OFREP_HEADERS', 'OFREP_TIMEOUT_MS'] as const;

/**
 * Builds the header list for the OFREP delegate: the provider's own entries plus any caller headers.
 *
 * `Content-Type` is deliberately absent. The delegate sets it itself and builds its headers with
 * `new Headers([...])`, which **appends** on a duplicate name rather than replacing - so sending
 * our own put `application/json; charset=utf-8, application/json` on the wire.
 * @param options - `apiKey` and caller `headers` from the provider options
 * @returns the header list to hand to the delegate
 */
export function buildOfrepHeaders(options: { apiKey?: string; headers?: Record<string, string> }): [string, string][] {
  const owned: Record<string, string> = {};
  // Truthiness, not a presence check: an empty apiKey must send no authentication header at all.
  if (options.apiKey) {
    owned[HTTP_HEADER_API_KEY] = options.apiKey;
  }

  return Object.entries(buildRequestHeaders(owned, options.headers));
}

/**
 * Runs `construct` with the OFREP environment variables removed, then puts them back.
 *
 * `getConfig` and every read it performs are synchronous, and so is the `OFREPProvider`
 * constructor, so on a single-threaded runtime no other JavaScript can observe the gap. `delete` is
 * used rather than assignment because `process.env.X = undefined` stores the *string* `"undefined"`,
 * which passes the delegate's truthiness guard and would make things worse.
 * @param construct - builds the delegate; must not await
 * @returns whatever `construct` returns
 */
export function withoutOfrepEnvironment<T>(construct: () => T): T {
  // Guarded so non-Node runtimes, where there is no environment to isolate, still construct.
  if (typeof process === 'undefined' || !process.env) {
    return construct();
  }

  const saved = OFREP_ENV_VARS.map((name): [string, string | undefined] => [name, process.env[name]]);
  for (const [name] of saved) {
    delete process.env[name];
  }

  try {
    return construct();
  } finally {
    // Restored even when the constructor throws on an invalid URL, and only for the variables that
    // were actually set - re-assigning an absent one would write the string "undefined".
    for (const [name, value] of saved) {
      if (value !== undefined) {
        process.env[name] = value;
      }
    }
  }
}

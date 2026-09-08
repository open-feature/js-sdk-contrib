import type { RequestHandler } from '@optimizely/optimizely-sdk/universal';

export interface FetchRequestHandlerOptions {
  /** Fetch implementation supplied by the edge runtime. Defaults to globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
  /**
   * Registers background requests with the edge runtime.
   * For Cloudflare Workers, pass `(task) => ctx.waitUntil(task)`.
   */
  schedule?: (task: Promise<unknown>) => void;
}

/** Creates an Optimizely Universal request handler backed only by Web APIs. */
export function createFetchRequestHandler(options: FetchRequestHandlerOptions = {}): RequestHandler {
  const fetchImplementation = options.fetch ?? globalThis.fetch;

  if (typeof fetchImplementation !== 'function') {
    throw new TypeError('A Fetch API implementation is required.');
  }

  return {
    makeRequest(url, headers, method, data) {
      const controller = new AbortController();
      const request = fetchImplementation(url, {
        method,
        headers: Object.fromEntries(
          Object.entries(headers).filter((entry): entry is [string, string] => entry[1] !== undefined),
        ),
        ...(data === undefined ? {} : { body: data }),
        signal: controller.signal,
      }).then(async (response) => {
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => {
          responseHeaders[key] = value;
        });

        return {
          statusCode: response.status,
          body: await response.text(),
          headers: responseHeaders,
        };
      });

      if (options.schedule) {
        try {
          options.schedule(request.catch(() => undefined));
        } catch {
          // Scheduling is an edge-runtime concern and must not change request semantics.
        }
      }

      return {
        abort: () => controller.abort(),
        responsePromise: request,
      };
    },
  };
}

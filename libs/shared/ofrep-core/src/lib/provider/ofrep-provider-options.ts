import { FetchAPI } from '../api';

export type OFREPProviderBaseOptions = {
  /**
   * Base URL for OFREP requests. Relative paths are supported.
   * For example, if your OFREP instance is available at
   * "https://host.com/path/{ofrep-api}" , you should set this to
   * "https://host.com/path" or "/path" (if your app and OFREP instance
   * share the same origin).
   */
  baseUrl: string;
  /**
   * Optional fetch implementation
   */
  fetchImplementation?: FetchAPI;
  /**
   * Optional Headers supplier function.
   * @returns HttpHeaders
   */
  headersFactory?: () => Promise<[string, string][]>;
  /**
   * Optional static headers.
   */
  headers?: [string, string][];
  /**
   * Optional static query params.
   */
  query?: URLSearchParams;
};

/**
 * Builds headers from static and factory, as well as default content type
 * @param options options
 * @returns built headers
 */
export async function buildHeaders(options?: OFREPProviderBaseOptions, etag: string | null = null): Promise<Headers> {
  return new Headers([
    ['Content-Type', 'application/json; charset=utf-8'],
    ...(options?.headers || []),
    ...((await options?.headersFactory?.()) || []),
    ...(etag ? ([['If-None-Match', etag]] as [string, string][]) : []),
  ]);
}

import { FetchAPI, RequestOptions } from '../api';

export type HttpHeaderList = [name: string, value: string][];
export type HttpHeaderMap = Record<string, string>;
export type HttpHeaders = HttpHeaderList | HttpHeaderMap;

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
  headersFactory?: () => HttpHeaders;
  /**
   * Optional static headers.
   */
  headers?: HttpHeaders;
};

export function toRequestOptions(options: OFREPProviderBaseOptions): RequestOptions {
  return {
    headers: mergeHeaders(options.headers, options.headersFactory?.()),
  };
}

export function mergeHeaders(...headersLists: Array<HttpHeaders | undefined>): HttpHeaderList {
  return headersLists.reduce<HttpHeaderList>(
    (merged, currentHeaders) => (currentHeaders ? merged.concat(toHeaderList(currentHeaders)) : merged),
    [],
  );
}

export function toHeaderList(headers: HttpHeaders): HttpHeaderList {
  return Array.isArray(headers) ? headers : Object.entries(headers);
}

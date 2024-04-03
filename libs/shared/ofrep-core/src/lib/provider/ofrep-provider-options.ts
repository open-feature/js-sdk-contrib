import { FetchAPI, RequestOptions } from '../api';

export type HttpHeaderList = [name: string, value: string][];
export type HttpHeaderMap = Record<string, string>;
export type HttpHeaders = HttpHeaderList | HttpHeaderMap;

export type OFREPProviderBaseOptions = {
  baseUrl: string;
  fetchImplementation?: FetchAPI;
  headersFactory?: () => HttpHeaders;
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

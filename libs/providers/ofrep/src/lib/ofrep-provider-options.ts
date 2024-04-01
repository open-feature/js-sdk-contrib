import { FetchAPI, RequestOptions } from '@openfeature/ofrep-core';

export type HttpHeaderList = [name: string, value: string][];
export type HttpHeaderMap = Record<string, string>;
export type HttpHeaders = HttpHeaderList | HttpHeaderMap;

export type OFREPProviderOptions = {
  baseUrl: string;
  fetchImplementation?: FetchAPI;
  headersFactory?: () => HttpHeaders;
  headers?: HttpHeaders;
};

export function toRequestOptions(options: OFREPProviderOptions): RequestOptions {
  return {
    headers: mergeHeaders(options.headers, options.headersFactory?.()),
  };
}

function mergeHeaders(...headersLists: Array<HttpHeaders | undefined>): HttpHeaderList {
  return headersLists.reduce<HttpHeaderList>(
    (merged, currentHeaders) => (currentHeaders ? merged.concat(toHeaderList(currentHeaders)) : merged),
    [],
  );
}

function toHeaderList(headers: HttpHeaders): HttpHeaderList {
  return Array.isArray(headers) ? headers : Object.entries(headers);
}

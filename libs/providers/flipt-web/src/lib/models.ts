export interface FliptWebProviderOptions {
  environment?: string;
  url?: string;
  authentication?: FliptWebProviderAuthentication;
  fetcher?: FliptFetcher;
}

export type FliptFetcher = (args?: FliptFetcherOptions) => Promise<Response>;

export interface FliptFetcherOptions {
  etag?: string;
}

export interface FliptClientTokenAuthentication {
  clientToken: string;
}

export interface FliptJwtAuthentication {
  jwtToken: string;
}

export type FliptWebProviderAuthentication = FliptClientTokenAuthentication | FliptJwtAuthentication;

export enum EvaluationReason {
  FLAG_DISABLED = 'FLAG_DISABLED_EVALUATION_REASON',
  MATCH = 'MATCH_EVALUATION_REASON',
  DEFAULT = 'DEFAULT_EVALUATION_REASON',
  UNKNOWN = 'UNKNOWN_EVALUATION_REASON',
}

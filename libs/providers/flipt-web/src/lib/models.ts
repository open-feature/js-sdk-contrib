export interface FliptWebProviderOptions {
  url?: string;
  authentication?: FliptWebProviderAuthentication;
  fetcher?: () => Promise<Response>;
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

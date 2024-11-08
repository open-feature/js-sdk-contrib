export interface UnleashContextOptions {
  userId?: string;
  sessionId?: string;
  remoteAddress?: string;
  currentTime?: string;
  properties?: {
      [key: string]: string;
  };
}

export interface UnleashOptions {
  url: string;
  clientKey: string;
  appName: string;
  context?: UnleashContextOptions;
  refreshInterval?: number;
  disableRefresh?: boolean;
  metricsInterval?: number;
  metricsIntervalInitial?: number;
}


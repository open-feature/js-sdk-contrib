import { FetchAPI } from '@openfeature/ofrep-core';
export interface OfrepWebProviderOptions {
  baseUrl: string;
  pollInterval?: number; // in milliseconds
  disablePolling?: boolean;
}

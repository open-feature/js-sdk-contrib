import type { OFREPProviderBaseOptions } from '@openfeature/ofrep-core';

export type OFREPWebProviderOptions = OFREPProviderBaseOptions & {
  /**
   * pollInterval is the time in milliseconds to wait between we call the OFREP
   * API to get the latest evaluation of your flags.
   *
   * If a negative number or 0 is provided, the provider will not poll the OFREP API.
   * This is the default behavior. Polling is available as an opt-in configuration.
   * Default: 0 (disabled)
   */
  pollInterval?: number; // in milliseconds
};

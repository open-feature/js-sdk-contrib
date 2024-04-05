import { OFREPProviderBaseOptions } from '@openfeature/ofrep-core';

export type OFREPWebProviderOptions = OFREPProviderBaseOptions & {
  /**
   * pollInterval is the time in milliseconds to wait between we call the OFREP
   * API to get the latest evaluation of your flags.
   *
   * If a negative number is provided, the provider will not poll the OFREP API.
   * Default: 30000
   */
  pollInterval?: number; // in milliseconds
};

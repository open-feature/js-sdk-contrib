import { ErrorCode } from '@openfeature/core';

interface ErrorOptions {
  cause?: Error;
}

class FlagsmithProviderError extends Error {
  public cause?: Error;
  constructor(
    message: string,
    public code: ErrorCode,
    options?: ErrorOptions,
  ) {
    super(message);
    this.name = 'FlagsmithProviderError';
    this.cause = options?.cause;
  }
}

export { FlagsmithProviderError };

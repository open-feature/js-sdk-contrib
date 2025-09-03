import { ErrorCode } from '@openfeature/core';

class FlagsmithProviderError extends Error {
  constructor(message: string, public code: ErrorCode) {
    super(message);
    this.name = "FlagsmithProviderError";
  }
}

export { FlagsmithProviderError };

import { ErrorCode, GeneralError, OpenFeatureError } from '@openfeature/server-sdk';

export class ErrorWithCode extends OpenFeatureError {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export class AggregateError extends GeneralError {
  constructor(
    message: string,
    public originalErrors: { source: string; error: unknown }[],
  ) {
    super(message);
  }
}

export const constructAggregateError = (providerErrors: { error: unknown; providerName: string }[]) => {
  const errorsWithSource = providerErrors
    .map(({ providerName, error }) => {
      return { source: providerName, error };
    })
    .flat();

  // log first error in the message for convenience, but include all errors in the error object for completeness
  return new AggregateError(
    `Provider errors occurred: ${errorsWithSource[0].source}: ${errorsWithSource[0].error}`,
    errorsWithSource,
  );
};

import {
  ErrorCode,
  EvaluationContext,
  FlagNotFoundError,
  ParseError,
  Provider,
  ResolutionDetails,
  TypeMismatchError,
} from '@openfeature/nodejs-sdk';
import {
  BooleanFlagResolutionApi,
  NumericFlagResolutionApi,
  ObjectFlagResolutionApi,
  StringFlagResolutionApi,
} from '@openfeature/provider-rest-client';
import axios from 'axios';

export class FlagdRESTProvider implements Provider {
  metadata = {
    name: 'Flagd REST',
  };

  private readonly booleanFlagResolutionApi: BooleanFlagResolutionApi;
  private readonly stringFlagResolutionApi: StringFlagResolutionApi;
  private readonly numberFlagResolutionApi: NumericFlagResolutionApi;
  private readonly objectFlagResolutionApi: ObjectFlagResolutionApi;

  constructor() {
    this.booleanFlagResolutionApi = new BooleanFlagResolutionApi();
    this.stringFlagResolutionApi = new StringFlagResolutionApi();
    this.numberFlagResolutionApi = new NumericFlagResolutionApi();
    this.objectFlagResolutionApi = new ObjectFlagResolutionApi();
  }

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<boolean>> {
    return this.booleanFlagResolutionApi
      .resolveBoolean(flagKey, defaultValue, transformedContext)
      .then((res) => res.data)
      .catch(this.errorMapper);
  }

  async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<string>> {
    return this.stringFlagResolutionApi
      .resolveString(flagKey, defaultValue, transformedContext)
      .then((res) => res.data)
      .catch(this.errorMapper);
  }

  async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<number>> {
    return this.numberFlagResolutionApi
      .resolveNumber(flagKey, defaultValue, transformedContext)
      .then((res) => res.data)
      .catch(this.errorMapper);
  }

  async resolveObjectEvaluation<U extends object>(
    flagKey: string,
    defaultValue: U,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<U>> {
    return (
      this.objectFlagResolutionApi
        .resolveObject(flagKey, defaultValue, transformedContext)
        // TODO correct types
        .then((res) => res.data as any)
        .catch(this.errorMapper)
    );
  }

  /**
   * Map known error codes to OpenFeature errors.
   */
  private errorMapper(err: unknown): never {
    if (axios.isAxiosError(err)) {
      const errorCode = err.response?.data?.errorCode ?? 'UNKNOWN';

      switch (errorCode) {
        case ErrorCode.TYPE_MISMATCH:
          throw new TypeMismatchError();
        case ErrorCode.PARSE_ERROR:
          throw new ParseError();
        case ErrorCode.FLAG_NOT_FOUND:
          throw new FlagNotFoundError();
      }
    }
    throw err;
  }
}

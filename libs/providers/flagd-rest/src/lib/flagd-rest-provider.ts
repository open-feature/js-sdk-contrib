import {
  EvaluationContext,
  FlagValueType,
  Provider,
  ResolutionDetails,
} from '@openfeature/nodejs-sdk';
import {
  BooleanFlagResolutionApi,
  StringFlagResolutionApi,
  NumericFlagResolutionApi,
  ObjectFlagResolutionApi,
  Configuration,
} from '@openfeature/provider-rest-client';
import axios, { AxiosError, AxiosResponse } from 'axios';

export class FlagdRESTProvider implements Provider {
  metadata = {
    name: 'Flagd REST',
  };

  private readonly booleanFlagResolutionApi: BooleanFlagResolutionApi;
  private readonly stringFlagResolutionApi: StringFlagResolutionApi;
  private readonly numberFlagResolutionApi: NumericFlagResolutionApi;
  private readonly objectFlagResolutionApi: ObjectFlagResolutionApi;

  constructor(configuration?: Configuration, basePath?: string) {
    this.booleanFlagResolutionApi = new BooleanFlagResolutionApi(
      configuration,
      basePath
    );
    this.stringFlagResolutionApi = new StringFlagResolutionApi(
      configuration,
      basePath
    );
    this.numberFlagResolutionApi = new NumericFlagResolutionApi(
      configuration,
      basePath
    );
    this.objectFlagResolutionApi = new ObjectFlagResolutionApi(
      configuration,
      basePath
    );
  }

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<boolean>> {
    return this.booleanFlagResolutionApi
      .resolveBoolean(flagKey, defaultValue, transformedContext)
      .then((res) => {
        console.log(res.data);
        return res.data;
      })
      .catch((err) => {
        console.error(err);
        if (axios.isAxiosError(err)) {
          console.log('is axios error');
          console.log(err.response?.data);
          if (err.response?.status === 404 && err.response) {
            console.log('404');
            return err.response.data;
          }
        }
        return { value: defaultValue };
      });
    // return (
    //   await this.booleanFlagResolutionApi.resolveBoolean(
    //     flagKey,
    //     defaultValue,
    //     transformedContext
    //   ).catch(this.errorResponseHandler)
    // ).data;
  }

  async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<string>> {
    return (
      await this.stringFlagResolutionApi.resolveString(
        flagKey,
        defaultValue,
        transformedContext
      )
    ).data;
  }

  async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<number>> {
    return (
      await this.numberFlagResolutionApi.resolveNumber(
        flagKey,
        defaultValue,
        transformedContext
      )
    ).data;
  }

  async resolveObjectEvaluation<U extends object>(
    flagKey: string,
    defaultValue: U,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<U>> {
    return (
      // TODO validate the object type
      (
        await this.objectFlagResolutionApi.resolveObject(
          flagKey,
          defaultValue,
          transformedContext
        )
      ).data as any
    );
  }

  private isDetailsPayload(
    payload: Partial<ResolutionDetails<FlagValueType>>
  ): boolean {
    return !!payload.value;
  }

  // TODO add payload validator

  // private errorHandler<T, U>(err: Error | AxiosError<T>): ResolutionDetails<U> {
  //   if (axios.isAxiosError(err) && err.isAxiosError) {
  //     err.response;
  //   }
  // }

  // private responseHandler<T, U>(
  //   response: AxiosResponse<T, unknown>
  // ): ResolutionDetails<U> {
  //   if (response) {
  //   }
  // }
}

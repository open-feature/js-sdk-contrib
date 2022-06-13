import {
  EvaluationContext,
  Provider,
  ResolutionDetails,
} from '@openfeature/nodejs-sdk';
import {
  BooleanFlagResolutionApi,
  StringFlagResolutionApi,
  NumericFlagResolutionApi,
  ObjectFlagResolutionApi,
} from '@openfeature/provider-rest-client';

// TODO make peer dependency
import 'axios';

export class FlagdRESTProvider implements Provider<unknown> {
  metadata = {
    name: 'Flagd REST',
  };

  contextTransformer = () => ({});

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
    return (
      await this.booleanFlagResolutionApi.resolveBoolean(
        flagKey,
        defaultValue,
        transformedContext
      )
    ).data;
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
}

import { EvaluationContext, Provider, JsonValue, ResolutionDetails, DefaultLogger, Logger, OpenFeatureError } from '@openfeature/server-sdk';

export class VendorMigrationProvider implements Provider {
  metadata = {
    name: VendorMigrationProvider.name,
  };

  readonly runsOn = 'server';

  private readonly logger: Logger;

  hooks = [];

  constructor(private readonly providers: Provider[], private readonly flagEvaluationMode = "strict", logger?: Logger) {
    this.logger = logger || new DefaultLogger()
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    return this.flagResolutionProxy<boolean>(flagKey, defaultValue, context);
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    return this.flagResolutionProxy(flagKey, defaultValue, context);
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    return this.flagResolutionProxy(flagKey, defaultValue, context);
  }

  resolveObjectEvaluation<U extends JsonValue>(
    flagKey: string,
    defaultValue: U,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<U>> {
    return this.flagResolutionProxy(flagKey, defaultValue, context);
  }

  async flagResolutionProxy<T extends boolean | string | number | JsonValue>(flagKey: string, defaultValue: T, context: EvaluationContext): Promise<ResolutionDetails<T>> {
    let result: ResolutionDetails<unknown> | undefined = undefined;
    const errors: Error[] = [];
    let resolutionSource = "";

    for (const provider of this.providers) {
      try {

        let evaluationResult: ResolutionDetails<any> | undefined = undefined;
        switch (typeof defaultValue) {

          case 'string':
            evaluationResult = await provider.resolveStringEvaluation(flagKey, defaultValue, context, this.logger);
            break;

          case 'number':
            evaluationResult = await provider.resolveNumberEvaluation(flagKey, defaultValue, context, this.logger);
            break;

          case 'object':
            evaluationResult = await provider.resolveObjectEvaluation(flagKey, defaultValue, context, this.logger);
            break;

          case 'boolean':
            evaluationResult = await provider.resolveObjectEvaluation(flagKey, defaultValue, context, this.logger);
            break;

          default:
            break;
        }

        if (result === undefined && evaluationResult) {
          result = evaluationResult as ResolutionDetails<T>;
          resolutionSource = provider.metadata.name;
        }

        if (result?.value != evaluationResult?.value) {
          this.logger.warn(`Flag value mismatch! Provider ${provider.metadata.name} resolved to a value different from ${resolutionSource} (higher precedence) for flag ${flagKey}`);
        }

      } catch (error: unknown) {
        this.logger.error(`The provider ${provider.metadata.name} threw while searching for flag ${flagKey}! Error: ${(error as OpenFeatureError).message || "unkown error"}`);
        errors.push(error as Error);
      }
    }
    //TODO: throw if there is no result && there are errors
    return result as ResolutionDetails<T>;
  }
}

import {EvaluationContext, JsonValue, Logger, ResolutionDetails} from "@openfeature/core";
import {FlagdCore} from "@openfeature/flagd-core";
import {Provider} from "@openfeature/server-sdk";

export class FlagdInProcess implements Provider {
  private _core: FlagdCore;

  constructor() {
    this._core = new FlagdCore()

    // todo initialize flags from outbound connection
  }

  readonly metadata = {
    name: 'flagd in-process provider',
  };


  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  resolveBooleanEvaluation(flagKey: string, defaultValue: boolean, context: EvaluationContext, logger: Logger): Promise<ResolutionDetails<boolean>> {
    return Promise.resolve(this._core.resolveBooleanEvaluation(flagKey, defaultValue, context));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  resolveNumberEvaluation(flagKey: string, defaultValue: number, context: EvaluationContext, logger: Logger): Promise<ResolutionDetails<number>> {
    return Promise.resolve(this._core.resolveNumberEvaluation(flagKey, defaultValue, context));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  resolveObjectEvaluation<T extends JsonValue>(flagKey: string, defaultValue: T, context: EvaluationContext, logger: Logger): Promise<ResolutionDetails<T>> {
    return Promise.resolve(this._core.resolveObjectEvaluation(flagKey, defaultValue, context));
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  resolveStringEvaluation(flagKey: string, defaultValue: string, context: EvaluationContext, logger: Logger): Promise<ResolutionDetails<string>> {
    return Promise.resolve(this._core.resolveStringEvaluation(flagKey, defaultValue, context));
  }

}

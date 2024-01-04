import { Service } from '../service';
import { EvaluationContext, JsonValue, Logger, ResolutionDetails } from '@openfeature/core';
import { Config } from '../../configuration';
import { FlagdCore } from '@openfeature/flagd-core';
import { DataFetch } from './data-fetch';
import { GrpcFetch } from './grpc/grpc-fetch';
import { FileFetch } from './file/file-fetch';

export class InProcessService implements Service {
  private _flagdCore: FlagdCore;
  private _dataFetcher: DataFetch;

  constructor(config: Config, dataFetcher?: DataFetch, logger?: Logger) {
    this._flagdCore = new FlagdCore(undefined, logger);
    this._dataFetcher = dataFetcher
      ? dataFetcher
      : config.offlineFlagSourcePath
      ? new FileFetch(config.offlineFlagSourcePath, logger)
      : new GrpcFetch(config, undefined, logger);
  }

  connect(
    reconnectCallback: () => void,
    changedCallback: (flagsChanged: string[]) => void,
    disconnectCallback: (message: string) => void,
  ): Promise<void> {
    return this._dataFetcher.connect(
      this.setFlagConfiguration.bind(this),
      reconnectCallback,
      changedCallback,
      disconnectCallback,
    );
  }

  async disconnect(): Promise<void> {
    this._dataFetcher.disconnect();
  }

  resolveBoolean(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<boolean>> {
    return Promise.resolve(this._flagdCore.resolveBooleanEvaluation(flagKey, defaultValue, context, logger));
  }

  resolveNumber(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<number>> {
    return Promise.resolve(this._flagdCore.resolveNumberEvaluation(flagKey, defaultValue, context, logger));
  }

  resolveString(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<string>> {
    return Promise.resolve(this._flagdCore.resolveStringEvaluation(flagKey, defaultValue, context, logger));
  }

  resolveObject<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<T>> {
    return Promise.resolve(this._flagdCore.resolveObjectEvaluation(flagKey, defaultValue, context, logger));
  }

  /**
   * Sets the flag configuration
   * @param flags The flags to set as stringified JSON
   * @returns {string[]} The flags that have changed
   * @throws — {Error} If the configuration string is invalid.
   */
  private setFlagConfiguration(flags: string): string[] {
    return this._flagdCore.setConfigurations(flags);
  }
}

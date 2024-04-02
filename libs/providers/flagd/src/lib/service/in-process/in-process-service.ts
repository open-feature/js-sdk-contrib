import { Service } from '../service';
import { EvaluationContext, FlagValue, JsonValue, Logger, ResolutionDetails, FlagValueType } from '@openfeature/core';
import { Config } from '../../configuration';
import { FlagdCore } from '@openfeature/flagd-core';
import { DataFetch } from './data-fetch';
import { GrpcFetch } from './grpc/grpc-fetch';
import { FileFetch } from './file/file-fetch';

export class InProcessService implements Service {
  private _flagdCore: FlagdCore;
  private _dataFetcher: DataFetch;

  constructor(
    private readonly config: Config,
    dataFetcher?: DataFetch,
    logger?: Logger,
  ) {
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

  async resolveBoolean(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<boolean>> {
    return this.evaluate('boolean', flagKey, defaultValue, context, logger);
  }

  async resolveNumber(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<number>> {
    return this.evaluate('number', flagKey, defaultValue, context, logger);
  }

  async resolveString(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<string>> {
    return this.evaluate('string', flagKey, defaultValue, context, logger);
  }

  async resolveObject<T extends JsonValue>(
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
    logger: Logger,
  ): Promise<ResolutionDetails<T>> {
    return this.evaluate('object', flagKey, defaultValue, context, logger);
  }

  private evaluate<T extends FlagValue>(
    type: FlagValueType,
    flagKey: string,
    defaultValue: T,
    context: EvaluationContext,
    logger: Logger,
  ): ResolutionDetails<T> {
    const details = this._flagdCore.resolve(type, flagKey, defaultValue, context, logger);
    return {
      ...details,
      flagMetadata: this.addFlagMetadata(),
    };
  }

  /**
   * Adds the flag metadata to the resolution details
   */
  private addFlagMetadata() {
    return {
      ...(this.config.selector ? { scope: this.config.selector } : {}),
    };
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

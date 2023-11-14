import {
  EvaluationContext,
  Provider,
  JsonValue,
  ResolutionDetails,
  StandardResolutionReasons,
  ErrorCode,
  ProviderMetadata,
  Logger,
  GeneralError,
  OpenFeatureEventEmitter,
  ProviderEvents,
  ProviderStatus,
} from '@openfeature/web-sdk';

import isEmpty from 'lodash.isempty';

import { basicLogger, LDClient, initialize, LDOptions, LDFlagChangeset } from 'launchdarkly-js-client-sdk';

import { LaunchDarklyProviderOptions } from './launchdarkly-provider-options';
import translateContext from './translate-context';
import translateResult from './translate-result';

/**
 * Create a ResolutionDetails for an evaluation that produced a type different
 * from the expected type.
 * @param value The default value to populate the ResolutionDetails with.
 * @returns A ResolutionDetails with the default value.
 */
function wrongTypeResult<T>(value: T): ResolutionDetails<T> {
  return {
    value,
    reason: StandardResolutionReasons.ERROR,
    errorCode: ErrorCode.TYPE_MISMATCH,
  };
}

export class LaunchDarklyClientProvider implements Provider {
  readonly metadata: ProviderMetadata = {
    name: 'launchdarkly-client-provider',
  };

  private readonly ldOptions: LDOptions | undefined;
  private readonly logger: Logger;
  private _client?: LDClient;

  public events = new OpenFeatureEventEmitter();

  /*
   * implement status field/accessor
   * https://openfeature.dev/specification/sections/providers#requirement-242
   * */
  private _status: ProviderStatus = ProviderStatus.NOT_READY;

  set status(status: ProviderStatus) {
    this._status = status;
  }

  get status() {
    return this._status;
  }

  constructor(
    private readonly envKey: string,
    { logger, ...ldOptions }: LaunchDarklyProviderOptions,
  ) {
    if (logger) {
      this.logger = logger;
    } else {
      this.logger = basicLogger({ level: 'info' });
    }
    this.ldOptions = { ...ldOptions, logger: this.logger };
  }

  private get client(): LDClient {
    if (!this._client) {
      throw new GeneralError('Provider is not initialized');
    }
    return this._client;
  }

  async initialize(context?: EvaluationContext): Promise<void> {
    const _context = isEmpty(context) ? { anonymous: true } : this.translateContext(context);
    this._client = initialize(this.envKey, _context, this.ldOptions);

    /*
     * set event listeners to propagate ld events to open feature provider,
     * use LD property streaming, since when enabled you are opting in for straming updates
     * */
    if (this.ldOptions?.streaming) {
      this.setListeners();
    }

    try {
      await this._client.waitForInitialization();
      this.status = ProviderStatus.READY;
    } catch {
      this.status = ProviderStatus.ERROR;
    }
  }

  onClose(): Promise<void> {
    return this.client.close();
  }

  /** set listeners to LD client and event the correspodent event in the Provider
   * necessary for LD streaming changes
   * */
  private setListeners() {
    this.client.on('change', (changeset: LDFlagChangeset) => {
      this.events.emit(ProviderEvents.ConfigurationChanged, {
        flagsChanged: Object.keys(changeset),
      });
    });
  }

  async onContextChange(oldContext: EvaluationContext, newContext: EvaluationContext): Promise<void> {
    // update the context on the LaunchDarkly client, this is so it does not have to be checked on each evaluation
    await this.client.identify(this.translateContext(newContext));
  }

  resolveBooleanEvaluation(flagKey: string, defaultValue: boolean): ResolutionDetails<boolean> {
    const res = this.client.variationDetail(flagKey, defaultValue);
    if (typeof res.value === 'boolean') {
      return translateResult(res);
    }
    return wrongTypeResult(defaultValue);
  }

  resolveNumberEvaluation(flagKey: string, defaultValue: number): ResolutionDetails<number> {
    const res = this.client.variationDetail(flagKey, defaultValue);
    if (typeof res.value === 'number') {
      return translateResult(res);
    }
    return wrongTypeResult(defaultValue);
  }

  resolveObjectEvaluation<T extends JsonValue>(flagKey: string, defaultValue: T): ResolutionDetails<T> {
    const res = this.client.variationDetail(flagKey, defaultValue);
    if (typeof res.value === 'object') {
      return translateResult(res);
    }
    return wrongTypeResult<T>(defaultValue);
  }

  resolveStringEvaluation(flagKey: string, defaultValue: string): ResolutionDetails<string> {
    const res = this.client.variationDetail(flagKey, defaultValue);
    if (typeof res.value === 'string') {
      return translateResult(res);
    }
    return wrongTypeResult(defaultValue);
  }

  private translateContext(context: EvaluationContext) {
    return translateContext(this.logger, context);
  }
}

import type {
  EvaluationContext,
  Provider,
  JsonValue,
  ResolutionDetails,
  ProviderMetadata,
  Logger,
  TrackingEventDetails,
} from '@openfeature/web-sdk';
import {
  StandardResolutionReasons,
  ErrorCode,
  GeneralError,
  OpenFeatureEventEmitter,
  ProviderEvents,
  ProviderStatus,
} from '@openfeature/web-sdk';

import isEmpty from 'lodash.isempty';

import type { LDClient, LDOptions, LDStartOptions, LDFlagSet, LDContext } from '@launchdarkly/js-client-sdk';
import { basicLogger, createClient } from '@launchdarkly/js-client-sdk';

import type { LaunchDarklyProviderOptions } from './launchdarkly-provider-options';
import translateContext from './translate-context';
import translateResult from './translate-result';

const WRAPPER_NAME = 'open-feature-community-js-client';
const WRAPPER_VERSION = '0.3.3'; // {{ x-release-please-version }}

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
  private readonly ldStartOptions: LDStartOptions;
  private readonly logger: Logger;
  private readonly initializationTimeout?: number;
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
    {
      logger,
      initializationTimeout,
      bootstrap,
      identifyOptions,
      timeout,
      ...ldOptions
    }: LaunchDarklyProviderOptions & LDStartOptions,
  ) {
    if (logger) {
      this.logger = logger;
    } else {
      this.logger = basicLogger({ level: 'info' });
    }
    this.initializationTimeout = initializationTimeout;
    this.ldOptions = {
      ...ldOptions,
      logger: this.logger,
      wrapperName: WRAPPER_NAME,
      wrapperVersion: WRAPPER_VERSION,
    };
    this.ldStartOptions = {
      timeout: timeout ?? this.initializationTimeout,
      bootstrap,
      identifyOptions,
    };
  }

  private get client(): LDClient {
    if (!this._client) {
      throw new GeneralError('Provider is not initialized');
    }
    return this._client;
  }

  async initialize(context?: EvaluationContext): Promise<void> {
    const _context: LDContext = isEmpty(context) ? ({ anonymous: true } as LDContext) : this.translateContext(context);
    this._client = createClient(this.envKey, _context, this.ldOptions);

    /*
     * set event listeners to propagate ld events to open feature provider,
     * use LD property streaming, since when enabled you are opting in for straming updates
     * */
    if (this.ldOptions?.streaming) {
      this.setListeners();
    }

    try {
      const result = await this._client.start(this.ldStartOptions);
      if (result.status === 'complete') {
        this.status = ProviderStatus.READY;
      } else {
        this.status = ProviderStatus.ERROR;
      }
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
    this.client.on('change', (_context: LDContext, flagsChanged: string[]) => {
      this.events.emit(ProviderEvents.ConfigurationChanged, { flagsChanged });
    });
  }

  async onContextChange(oldContext: EvaluationContext, newContext: EvaluationContext): Promise<void> {
    // update the context on the LaunchDarkly client, this is so it does not have to be checked on each evaluation
    await this.client.identify(this.translateContext(newContext));
  }

  resolveBooleanEvaluation(flagKey: string, defaultValue: boolean): ResolutionDetails<boolean> {
    const res = this.client.boolVariationDetail(flagKey, defaultValue);
    if (typeof res.value === 'boolean') {
      return translateResult(res);
    }
    return wrongTypeResult(defaultValue);
  }

  resolveNumberEvaluation(flagKey: string, defaultValue: number): ResolutionDetails<number> {
    const res = this.client.numberVariationDetail(flagKey, defaultValue);
    if (typeof res.value === 'number') {
      return translateResult(res);
    }
    return wrongTypeResult(defaultValue);
  }

  resolveObjectEvaluation<T extends JsonValue>(flagKey: string, defaultValue: T): ResolutionDetails<T> {
    const res = this.client.jsonVariationDetail(flagKey, defaultValue);
    if (typeof res.value === 'object') {
      return translateResult(res);
    }
    return wrongTypeResult<T>(defaultValue);
  }

  resolveStringEvaluation(flagKey: string, defaultValue: string): ResolutionDetails<string> {
    const res = this.client.stringVariationDetail(flagKey, defaultValue);
    if (typeof res.value === 'string') {
      return translateResult(res);
    }
    return wrongTypeResult(defaultValue);
  }

  track(trackingEventName: string, _context: EvaluationContext, { value, ...details }: TrackingEventDetails): void {
    // The LD Client already has the context form the identify method, so we can omit it here.
    this.client.track(trackingEventName, details, value);
  }

  private translateContext(context: EvaluationContext) {
    return translateContext(this.logger, context);
  }
}

import { CallbackClient, createCallbackClient, createPromiseClient, PromiseClient } from '@bufbuild/connect';
import { createConnectTransport } from '@bufbuild/connect-web';
import { Struct } from '@bufbuild/protobuf';
import {
  EvaluationContext,
  FlagNotFoundError,
  FlagValue,
  JsonValue,
  Logger,
  OpenFeature,
  OpenFeatureEventEmitter,
  Provider,
  ProviderEvents,
  ResolutionDetails,
  StandardResolutionReasons,
  TypeMismatchError,
} from '@openfeature/web-sdk';
import { Service } from '../proto/ts/schema/v1/schema_connect';
import { AnyFlag } from '../proto/ts/schema/v1/schema_pb';
import { FlagdProviderOptions, getOptions } from './options';

export const ERROR_DISABLED = 'DISABLED';

const EVENT_CONFIGURATION_CHANGE = 'configuration_change';
const EVENT_PROVIDER_READY = 'provider_ready';
const BACK_OFF_MULTIPLIER = 2;

const INITIAL_DELAY_MS = 100;
type AnyFlagResolutionType = typeof AnyFlag.prototype.value.case;

export class FlagdWebProvider implements Provider {
  metadata = {
    name: 'flagd-web',
  };

  private _connected = false;
  private _promiseClient: PromiseClient<typeof Service>;
  private _callbackClient: CallbackClient<typeof Service>;
  private _maxRetries: number;
  private _maxDelay: number;
  private _retry = 0;
  private _delayMs = INITIAL_DELAY_MS;
  private _logger?: Logger;
  private _flags: { [key: string]: ResolutionDetails<FlagValue> & { type: AnyFlagResolutionType } } = {};
  private _cancelFunction: (() => void) | undefined;

  constructor(
    options: FlagdProviderOptions,
    logger?: Logger,
    promiseClient?: PromiseClient<typeof Service>,
    callbackClient?: CallbackClient<typeof Service>
  ) {
    const { host, port, tls, maxRetries, maxDelay, pathPrefix } = getOptions(options);
    const transport = createConnectTransport({
      baseUrl: `${tls ? 'https' : 'http'}://${host}:${port}/${pathPrefix}`,
    });
    this._promiseClient = promiseClient ? promiseClient : createPromiseClient(Service, transport);
    this._callbackClient = callbackClient ? callbackClient : createCallbackClient(Service, transport);
    this._maxRetries = maxRetries === 0 ? Infinity : maxRetries;
    this._maxDelay = maxDelay;
    this._logger = logger;
  }

  events = new OpenFeatureEventEmitter();

  async onContextChange(oldContext: EvaluationContext, newContext: EvaluationContext): Promise<void> {
    await this.fetchAll(newContext);
  }

  async initialize(context: EvaluationContext): Promise<void> {
    await this.retryConnect();
  }

  resolveBooleanEvaluation(flagKey: string, _: boolean): ResolutionDetails<boolean> {
    return this.evaluate(flagKey, 'boolValue');
  }

  resolveStringEvaluation(flagKey: string, _: string): ResolutionDetails<string> {
    return this.evaluate(flagKey, 'stringValue');
  }

  resolveNumberEvaluation(flagKey: string, _: number): ResolutionDetails<number> {
    return this.evaluate(flagKey, 'doubleValue');
  }

  resolveObjectEvaluation<U extends JsonValue>(flagKey: string, _: U): ResolutionDetails<U> {
    return this.evaluate(flagKey, 'objectValue');
  }

  onClose(): Promise<void> {
    // close the stream using the saved cancel function
    return Promise.resolve(this._cancelFunction?.());
  }

  private evaluate<T extends FlagValue>(flagKey: string, type: AnyFlagResolutionType): ResolutionDetails<T> {
    const resolved = this._flags[flagKey];
    if (!resolved) {
      throw new FlagNotFoundError(`flag key ${flagKey} not found in cache`);
    }
    if (resolved.type !== type) {
      throw new TypeMismatchError(`flag key ${flagKey} is not of type ${type}`);
    }
    return {
      // return reason=CACHED if we're disconnected since we can't guarantee things are up to date
      reason: this._connected ? resolved.reason : StandardResolutionReasons.CACHED,
      variant: resolved.variant,
      value: resolved.value as T,
    };
  }

  private async retryConnect() {
    this._delayMs = Math.min(this._delayMs * BACK_OFF_MULTIPLIER, this._maxDelay);

    return new Promise<void>((resolve) => {
      this._cancelFunction = this._callbackClient.eventStream(
        {},
        (message) => {
          // get the context at the time of the message
          const currentContext = OpenFeature.getContext();
          this._logger?.debug(`${FlagdWebProvider.name}: event received: ${message.type}`);
          switch (message.type) {
            case EVENT_PROVIDER_READY:
              this.fetchAll(currentContext).then(() => {
                this.resetConnectionState();
                resolve();
              });
              return;
            case EVENT_CONFIGURATION_CHANGE: {
              this.fetchAll(currentContext).then(() => {
                this.events.emit(ProviderEvents.ConfigurationChanged);
              });
              return;
            }
          }
        },
        (err) => {
          this._logger?.error(`${FlagdWebProvider.name}: could not establish connection to flagd, ${err?.message}`);
          this._logger?.debug(err?.stack);
          if (this._retry < this._maxRetries) {
            this._retry++;
            setTimeout(() => this.retryConnect(), this._delayMs);
          } else {
            this._logger?.warn(`${FlagdWebProvider.name}: max retries reached`);
            this.events.emit(ProviderEvents.Error);
          }
        }
      );
    });
  }

  private async fetchAll(context: EvaluationContext) {
    const transformedContext = this.transformContext(context);
    const allResolved = await this._promiseClient.resolveAll({ context: transformedContext });
    this._flags = Object.keys(allResolved.flags).reduce((accumuated, currentKey) => {
      const resolved = allResolved.flags[currentKey];
      // reducer to store the resolved bulk response in a map of ResolutionDetails,
      // with an addition annotation for the type (typeof AnyFlag.prototype.value.case)
      return {
        ...accumuated,
        [currentKey]: {
          type: resolved.value.case,
          reason: resolved.reason,
          variant: resolved.variant,
          // if it's an object, we have to parse it.
          value:
            resolved.value.case === 'objectValue' ? (resolved.value.value as Struct).toJson() : resolved.value.value,
        },
      };
    }, {});
  }

  private resetConnectionState() {
    this._retry = 0;
    this._delayMs = INITIAL_DELAY_MS;
    this._connected = true;
  }

  private transformContext(context: EvaluationContext): Struct {
    return Struct.fromJson(context as JsonValue);
  }
}

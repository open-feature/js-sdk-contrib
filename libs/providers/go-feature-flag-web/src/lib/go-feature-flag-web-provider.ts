import {
  EvaluationContext,
  FlagNotFoundError,
  FlagValue,
  Hook,
  Logger,
  OpenFeature,
  OpenFeatureEventEmitter,
  Provider,
  ProviderEvents,
  ResolutionDetails,
  StandardResolutionReasons,
  TypeMismatchError,
} from '@openfeature/web-sdk';
import {
  FlagState,
  GoFeatureFlagAllFlagRequest,
  GOFeatureFlagAllFlagsResponse,
  GoFeatureFlagWebProviderOptions,
  GOFeatureFlagWebsocketResponse,
} from './model';
import { transformContext } from './context-transformer';
import { FetchError } from './errors/fetch-error';
import { GoFeatureFlagDataCollectorHook } from './data-collector-hook';

export class GoFeatureFlagWebProvider implements Provider {
  metadata = {
    name: GoFeatureFlagWebProvider.name,
  };
  events = new OpenFeatureEventEmitter();
  // hooks is the list of hooks that are used by the provider
  hooks?: Hook[];
  private readonly _websocketPath = 'ws/v1/flag/change';
  // logger is the Open Feature logger to use
  private _logger?: Logger;
  // endpoint of your go-feature-flag relay proxy instance
  private readonly _endpoint: string;
  // timeout in millisecond before we consider the http request as a failure
  private readonly _apiTimeout: number;
  // apiKey is the key used to identify your request in GO Feature Flag
  private readonly _apiKey: string | undefined;
  // initial delay in millisecond to wait before retrying to connect
  private readonly _retryInitialDelay;
  // multiplier of _retryInitialDelay after each failure
  private readonly _retryDelayMultiplier;
  // maximum number of retries
  private readonly _maxRetries;
  // _websocket is the reference to the websocket connection
  private _websocket?: WebSocket;
  // _flags is the in memory representation of all the flags.
  private _flags: { [key: string]: ResolutionDetails<FlagValue> } = {};
  private readonly _dataCollectorHook: GoFeatureFlagDataCollectorHook;
  // disableDataCollection set to true if you don't want to collect the usage of flags retrieved in the cache.
  private readonly _disableDataCollection: boolean;

  constructor(options: GoFeatureFlagWebProviderOptions, logger?: Logger) {
    this._logger = logger;
    this._apiTimeout = options.apiTimeout || 0; // default is 0 = no timeout
    this._endpoint = options.endpoint;
    this._retryInitialDelay = options.retryInitialDelay || 100;
    this._retryDelayMultiplier = options.retryDelayMultiplier || 2;
    this._maxRetries = options.maxRetries || 10;
    this._apiKey = options.apiKey;
    this._disableDataCollection = options.disableDataCollection || false;
    this._dataCollectorHook = new GoFeatureFlagDataCollectorHook(options, logger);
  }

  async initialize(context: EvaluationContext): Promise<void> {
    if (!this._disableDataCollection && this._dataCollectorHook) {
      this.hooks = [this._dataCollectorHook];
      this._dataCollectorHook.init();
    }
    return Promise.all([this.fetchAll(context), this.connectWebsocket()])
      .then(() => {
        this._logger?.debug(`${GoFeatureFlagWebProvider.name}: go-feature-flag provider initialized`);
      })
      .catch((error) => {
        this._logger?.error(
          `${GoFeatureFlagWebProvider.name}: initialization failed, provider is on error, we will try to reconnect: ${error}`,
        );
        this.handleFetchErrors(error);

        // The initialization of the provider is in a failing state, we unblock the initialize method,
        // and we launch the retry to fetch the data.
        this.retryFetchAll(context);
        this.reconnectWebsocket();
      });
  }

  /**
   * connectWebsocket is starting the websocket and associate some handler
   * to react if the state of the websocket change.
   */
  async connectWebsocket(): Promise<void> {
    const wsURL = new URL(this._endpoint);
    wsURL.pathname = wsURL.pathname.endsWith('/')
      ? wsURL.pathname + this._websocketPath
      : wsURL.pathname + '/' + this._websocketPath;
    wsURL.protocol = wsURL.protocol === 'https:' ? 'wss' : 'ws';

    // adding API Key if GO Feature Flag use api keys.
    if (this._apiKey) {
      wsURL.searchParams.set('apiKey', this._apiKey);
    }

    this._logger?.debug(`${GoFeatureFlagWebProvider.name}: Trying to connect the websocket at ${wsURL}`);

    this._websocket = new WebSocket(wsURL);
    await this.waitWebsocketFinalStatus(this._websocket).catch((reason) => {
      throw new Error(`impossible to connect to the websocket: ${reason}`);
    });

    this._websocket.onopen = (event) => {
      this._logger?.info(`${GoFeatureFlagWebProvider.name}: Websocket to go-feature-flag open: ${event}`);
    };
    this._websocket.onmessage = async ({ data }) => {
      this._logger?.info(`${GoFeatureFlagWebProvider.name}: Change in your configuration flag`);
      const t: GOFeatureFlagWebsocketResponse = JSON.parse(data);
      const flagsChanged = this.extractFlagNamesFromWebsocket(t);
      await this.retryFetchAll(OpenFeature.getContext(), flagsChanged);
    };
    this._websocket.onclose = async () => {
      this._logger?.warn(`${GoFeatureFlagWebProvider.name}: Websocket closed, trying to reconnect`);
      await this.reconnectWebsocket();
    };
    this._websocket.onerror = async (event: Event) => {
      this._logger?.error(`${GoFeatureFlagWebProvider.name}: Error while connecting the websocket: ${event}`);
      await this.reconnectWebsocket();
    };
  }

  /**
   * waitWebsocketFinalStatus is waiting synchronously for the websocket to be in a stable
   * state (CLOSED or OPEN).
   * @param socket - the websocket you are waiting for
   */
  waitWebsocketFinalStatus(socket: WebSocket): Promise<void> {
    return new Promise((resolve, reject) => {
      // wait until the socket is in a stable state or until the timeout is reached
      const websocketTimeout = this._apiTimeout !== 0 ? this._apiTimeout : 5000;
      const timeout = setTimeout(() => {
        if (socket.readyState !== WebSocket.OPEN && socket.readyState !== WebSocket.CLOSED) {
          reject(`timeout of ${websocketTimeout} ms reached when initializing the websocket`);
        }
      }, websocketTimeout);

      socket.onopen = () => {
        clearTimeout(timeout);
        resolve();
      };

      socket.onclose = () => {
        clearTimeout(timeout);
        resolve();
      };
    });
  }

  async onClose(): Promise<void> {
    if (!this._disableDataCollection && this._dataCollectorHook) {
      await this._dataCollectorHook?.close();
    }
    this._websocket?.close(1000, 'Closing GO Feature Flag provider');
    return Promise.resolve();
  }

  async onContextChange(_: EvaluationContext, newContext: EvaluationContext): Promise<void> {
    this._logger?.debug(`${GoFeatureFlagWebProvider.name}: new context provided: ${newContext}`);
    this.events.emit(ProviderEvents.Stale, { message: 'context has changed' });
    await this.retryFetchAll(newContext);
    this.events.emit(ProviderEvents.Ready, { message: '' });
  }

  resolveNumberEvaluation(flagKey: string): ResolutionDetails<number> {
    return this.evaluate(flagKey, 'number');
  }

  resolveObjectEvaluation<T extends FlagValue>(flagKey: string): ResolutionDetails<T> {
    return this.evaluate(flagKey, 'object');
  }

  resolveStringEvaluation(flagKey: string): ResolutionDetails<string> {
    return this.evaluate(flagKey, 'string');
  }

  resolveBooleanEvaluation(flagKey: string): ResolutionDetails<boolean> {
    return this.evaluate(flagKey, 'boolean');
  }

  /**
   * extract flag names from the websocket answer
   */
  private extractFlagNamesFromWebsocket(wsResp: GOFeatureFlagWebsocketResponse): string[] {
    let flags: string[] = [];
    if (wsResp.deleted) {
      flags = [...flags, ...Object.keys(wsResp.deleted)];
    }
    if (wsResp.updated) {
      flags = [...flags, ...Object.keys(wsResp.updated)];
    }
    if (wsResp.added) {
      flags = [...flags, ...Object.keys(wsResp.added)];
    }
    return flags;
  }

  /**
   * reconnectWebsocket is using an exponential backoff pattern to try to restart the connection
   * to the websocket.
   */
  private async reconnectWebsocket() {
    let delay = this._retryInitialDelay;
    let attempt = 0;
    while (attempt < this._maxRetries) {
      attempt++;
      await this.connectWebsocket();
      if (this._websocket !== undefined && this._websocket.readyState === WebSocket.OPEN) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= this._retryDelayMultiplier;
      this._logger?.info(
        `${GoFeatureFlagWebProvider.name}: error while reconnecting the websocket, next try in ${delay} ms (${attempt}/${this._maxRetries}).`,
      );
    }
    this.events.emit(ProviderEvents.Stale, {
      message: 'impossible to get status from GO Feature Flag (websocket connection stopped)',
    });
  }

  private evaluate<T extends FlagValue>(flagKey: string, type: string): ResolutionDetails<T> {
    const resolved = this._flags[flagKey];
    if (!resolved) {
      throw new FlagNotFoundError(`flag key ${flagKey} not found in cache`);
    }

    if (typeof resolved.value !== type) {
      throw new TypeMismatchError(`flag key ${flagKey} is not of type ${type}`);
    }
    return {
      variant: resolved.variant,
      value: resolved.value as T,
      flagMetadata: resolved.flagMetadata,
      errorCode: resolved.errorCode,
      errorMessage: resolved.errorMessage,
      reason: this._websocket?.readyState !== WebSocket.OPEN ? StandardResolutionReasons.CACHED : resolved.reason,
    };
  }

  private async retryFetchAll(ctx: EvaluationContext, flagsChanged: string[] = []) {
    let delay = this._retryInitialDelay;
    let attempt = 0;
    while (attempt < this._maxRetries) {
      attempt++;
      try {
        await this.fetchAll(ctx, flagsChanged);
        return;
      } catch (err) {
        this.handleFetchErrors(err);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= this._retryDelayMultiplier;
        this._logger?.info(
          `${GoFeatureFlagWebProvider.name}: Waiting ${delay} ms before trying to evaluate the flags (${attempt}/${this._maxRetries}).`,
        );
      }
    }
  }

  /**
   * fetchAll is a function that is calling GO Feature Flag to bulk evaluate flags.
   * It emits an event to notify when it is ready or on error.
   *
   * @param context - The static evaluation context
   * @param flagsChanged - The list of flags update - default: []
   * @private
   */
  private async fetchAll(context: EvaluationContext, flagsChanged: string[] = []) {
    const endpointURL = new URL(this._endpoint);
    const path = 'v1/allflags';
    endpointURL.pathname = endpointURL.pathname.endsWith('/')
      ? endpointURL.pathname + path
      : endpointURL.pathname + '/' + path;

    const request: GoFeatureFlagAllFlagRequest = { evaluationContext: transformContext(context) };
    const init: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // we had the authorization header only if we have an API Key
        ...(this._apiKey ? { Authorization: `Bearer ${this._apiKey}` } : {}),
      },
      body: JSON.stringify(request),
    };
    const response = await fetch(endpointURL.toString(), init);

    if (!response?.ok) {
      throw new FetchError(response.status);
    }

    const data = (await response.json()) as GOFeatureFlagAllFlagsResponse;
    // In case we are in success
    let flags = {};
    Object.keys(data.flags).forEach((currentValue) => {
      const resolved: FlagState<FlagValue> = data.flags[currentValue];
      const resolutionDetails: ResolutionDetails<FlagValue> = {
        value: resolved.value,
        variant: resolved.variationType,
        errorCode: resolved.errorCode,
        flagMetadata: resolved.metadata,
        reason: resolved.reason,
      };
      flags = {
        ...flags,
        [currentValue]: resolutionDetails,
      };
    });
    const hasFlagsLoaded = this._flags !== undefined && Object.keys(this._flags).length !== 0;
    this._flags = flags;
    if (hasFlagsLoaded) {
      this.events.emit(ProviderEvents.ConfigurationChanged, {
        message: 'flag configuration have changed',
        flagsChanged: flagsChanged,
      });
    }
  }

  /**
   * handleFetchErrors is a function that take care of the errors that can be thrown
   * inside the FetchAll method.
   *
   * @param error - The error thrown
   * @private
   */
  private handleFetchErrors(error: unknown) {
    if (error instanceof FetchError) {
      this.events.emit(ProviderEvents.Error, {
        message: error.message,
      });
      if (error.status == 401) {
        this._logger?.error(
          `${GoFeatureFlagWebProvider.name}: invalid token used to contact GO Feature Flag instance: ${error}`,
        );
      } else if (error.status === 404) {
        this._logger?.error(
          `${GoFeatureFlagWebProvider.name}: impossible to call go-feature-flag relay proxy ${error}`,
        );
      } else {
        this._logger?.error(`${GoFeatureFlagWebProvider.name}: unknown error while retrieving flags: ${error}`);
      }
    } else {
      this._logger?.error(`${GoFeatureFlagWebProvider.name}: unknown error while retrieving flags: ${error}`);
      this.events.emit(ProviderEvents.Error, {
        message: 'unknown error while retrieving flags',
      });
    }
  }
}

import {
  EvaluationContext, FlagMetadata,
  FlagNotFoundError,
  FlagValue,
  Logger,
  OpenFeature,
  OpenFeatureEventEmitter,
  Provider,
  ProviderEvents,
  ResolutionDetails, ResolutionReason,
  StandardResolutionReasons,
  TypeMismatchError,
} from "@openfeature/web-sdk";
import {GoFeatureFlagAllFlagRequest, GOFeatureFlagAllFlagsResponse, GoFeatureFlagWebProviderOptions,} from "./model";
import axios from "axios";
import {transformContext} from "./context-transformer";

export class GoFeatureFlagWebProvider implements Provider {
  private readonly _websocketPath = "ws/v1/flag/change"

  metadata = {
    name: GoFeatureFlagWebProvider.name,
  };
  events = new OpenFeatureEventEmitter();

  // logger is the Open Feature logger to use
  private _logger?: Logger;
  // endpoint of your go-feature-flag relay proxy instance
  private readonly _endpoint: string;
  // timeout in millisecond before we consider the http request as a failure
  private readonly _apiTimeout: number;

  // initial delay in millisecond to wait before retrying to connect the websocket
  private readonly _websocketRetryInitialDelay;
  // multiplier of _websocketRetryInitialDelay after each failure
  private readonly _websocketRetryDelayMultiplier;
  // maximum number of retries
  private readonly _websocketMaxRetries;

  // _websocket is the reference to the websocket connection
  private _websocket?: WebSocket;
  // _flags is the in memory representation of all the flags.
  private _flags: { [key: string]: ResolutionDetails<FlagValue> } = {};


  constructor(options: GoFeatureFlagWebProviderOptions, logger?: Logger) {
    this._logger = logger;
    this._apiTimeout = options.apiTimeout || 0; // default is 0 = no timeout
    this._endpoint = options.endpoint;
    this._websocketRetryInitialDelay = options.websocketRetryInitialDelay || 100;
    this._websocketRetryDelayMultiplier = options.websocketRetryDelayMultiplier || 2;
    this._websocketMaxRetries = options.websocketMaxRetries || 10;
    // Add API key to the headers
    if (options.apiKey) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${options.apiKey}`;
    }
  }

  async initialize(context: EvaluationContext): Promise<void> {
    await this.fetchAll(context);
    await this.connectWebsocket();
    this._logger?.debug("go-feature-flag provider initialized")
  }

  /**
   * connectWebsocket is starting the websocket and associate some handler
   * to react if the state of the websocket change.
   */
  async connectWebsocket(): Promise<void> {
    const wsURL = new URL(this._endpoint);
    wsURL.pathname =
      wsURL.pathname.endsWith('/') ? wsURL.pathname + this._websocketPath : wsURL.pathname + '/' + this._websocketPath;
    wsURL.protocol = "ws"
    this._logger?.debug(`Trying to connect the websocket at ${wsURL}`)

    this._websocket = new WebSocket(wsURL, ["ws", "http", "https"]);
    await this.waitWebsocketFinalStatus(this._websocket);

    this._websocket.onopen = (event) => {
      this._logger?.info(`Websocket to go-feature-flag open: ${event}`);
    };
    this._websocket.onmessage = async () => {
      this._logger?.info(`Change in your configuration flag`);
      await this.fetchAll(OpenFeature.getContext());
    }
    this._websocket.onclose = async () => {
      this._logger?.info(`Websocket closed, trying to reconnect`);
      await this.reconnectWebsocket();
    };
    this._websocket.onerror = async (event: Event) => {
      this._logger?.error(`Error while connecting the websocket: ${event}`);
      await this.reconnectWebsocket();
    };
  }

  /**
   * waitWebsocketFinalStatus is waiting synchronously for the websocket to be in a stable
   * state (CLOSED or OPEN).
   * @param socket - the websocket you are waiting for
   */
  waitWebsocketFinalStatus(socket: WebSocket): Promise<void> {
    return new Promise((resolve) => {
      const checkConnection = () => {
        if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CLOSED) {
          return resolve();
        }
        // Wait 5 milliseconds before checking again
        setTimeout(checkConnection, 5);
      };
      checkConnection();
    });
  }


  /**
   * reconnectWebsocket is using an exponential backoff pattern to try to restart the connection
   * to the websocket.
   */
  async reconnectWebsocket() {
    let delay = this._websocketRetryInitialDelay;
    let attempt = 0;
    while (attempt < this._websocketMaxRetries) {
      attempt++;
      await this.connectWebsocket()
      if (this._websocket !== undefined && this._websocket.readyState === WebSocket.OPEN) {
        return
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= this._websocketRetryDelayMultiplier;
      this._logger?.info(`error while reconnecting the websocket, next try in ${delay} ms (${attempt}/${this._websocketMaxRetries}).`)
    }
    this.events.emit(ProviderEvents.Stale)
  }

  onClose(): Promise<void> {
    this._websocket?.close(1000, "Closing GO Feature Flag provider");
    return Promise.resolve(undefined);
  }

  async onContextChange(_: EvaluationContext, newContext: EvaluationContext): Promise<void> {
    this._logger?.debug(`new context provided: ${newContext}`);
    await this.fetchAll(newContext);
  }

  resolveNumberEvaluation(flagKey: string): ResolutionDetails<number> {
    return this.evaluate(flagKey, 'number')
  }

  resolveObjectEvaluation<T extends FlagValue>(flagKey: string): ResolutionDetails<T> {
    return this.evaluate(flagKey, 'object')
  }

  resolveStringEvaluation(flagKey: string): ResolutionDetails<string> {
    return this.evaluate(flagKey, 'string')
  }

  resolveBooleanEvaluation(flagKey: string): ResolutionDetails<boolean> {
    return this.evaluate(flagKey, 'boolean')
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

  private async fetchAll(context: EvaluationContext) {
    const endpointURL = new URL(this._endpoint);
    const path = 'v1/allflags';
    endpointURL.pathname = endpointURL.pathname.endsWith('/') ? endpointURL.pathname + path : endpointURL.pathname + '/' + path;

    try {
      const request: GoFeatureFlagAllFlagRequest = {evaluationContext: transformContext(context)};
      const response = await axios.post<GOFeatureFlagAllFlagsResponse>(endpointURL.toString(), request, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: this._apiTimeout,
      });

      // In case we are in success
      let flags = {};
      Object.keys(response.data.flags).forEach(currentValue => {
        const resolved = response.data.flags[currentValue];
        const resolutionDetails: ResolutionDetails<FlagValue> = {
          value: resolved.value,
          variant: resolved.variationType,
          errorCode: resolved.errorCode,
          flagMetadata: resolved.metadata,
          reason: resolved.reason
        };
        flags = {
          ...flags,
          [currentValue]: resolutionDetails
        };
      });

      const hasFlagsLoaded = this._flags !== undefined && Object.keys(this._flags).length !== 0
      this._flags = flags;
      if (hasFlagsLoaded) {
        this.events.emit(ProviderEvents.ConfigurationChanged)
      }
    } catch (error) {
      this.events.emit(ProviderEvents.Error)
      if (axios.isAxiosError(error)) {
        if (error.response?.status == 401) {
          this._logger?.error(`invalid token used to contact GO Feature Flag instance: ${error}`);
        } else if (error.code === 'ECONNREFUSED' || error.response?.status === 404) {
          this._logger?.error(`impossible to call go-feature-flag relay proxy on ${endpointURL}: ${error}`);
        } else if (error.code === 'ECONNABORTED') {
          this._logger?.error(`impossible to retrieve the flags on time: ${error}`);
        } else {
          this._logger?.error(`unknown error while retrieving flags: ${error}`);
        }
      } else {
        this._logger?.error(`unknown error while retrieving flags: ${error}`);
      }
    }
  }
}

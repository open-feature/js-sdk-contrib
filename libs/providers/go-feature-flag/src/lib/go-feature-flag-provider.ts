import {
  ErrorCode,
  EvaluationContext,
  FlagNotFoundError,
  JsonValue,
  Logger,
  Provider,
  ResolutionDetails,
  StandardResolutionReasons,
  TypeMismatchError,
} from '@openfeature/js-sdk';
import axios from 'axios';
import _ from 'lodash';
import {transformContext} from './context-transformer';
import {ProxyNotReady} from './errors/proxyNotReady';
import {ProxyTimeout} from './errors/proxyTimeout';
import {UnknownError} from './errors/unknownError';
import {Unauthorized} from './errors/unauthorized';
import {LRUCache} from 'lru-cache';
import {
  DataCollectorRequest,
  DataCollectorResponse,
  FeatureEvent,
  GoFeatureFlagProviderOptions,
  GoFeatureFlagProxyRequest,
  GoFeatureFlagProxyResponse,
  GoFeatureFlagUser,
} from './model';

// GoFeatureFlagProvider is the official Open-feature provider for GO Feature Flag.
export class GoFeatureFlagProvider implements Provider {
  metadata = {
    name: GoFeatureFlagProvider.name,
  };

  // endpoint of your go-feature-flag relay proxy instance
  private readonly endpoint: string;

  // timeout in millisecond before we consider the request as a failure
  private readonly timeout: number;

  // cache contains the local cache used in the provider to avoid calling the relay-proxy for every evaluation
  private readonly cache?: LRUCache<string, ResolutionDetails<any>>;

  // bgSchedulerId contains the id of the setInterval that is running.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  private bgScheduler?: NodeJS.Timer;

  // dataCollectorBuffer contains all the FeatureEvents that we need to send to the relay-proxy for data collection.
  private dataCollectorBuffer?: FeatureEvent<any>[];

  // dataCollectorMetadata are the metadata used when calling the data collector endpoint
  private readonly dataCollectorMetadata: Record<string, string> = {
    provider: 'open-feature-js-sdk',
  };

  // cacheTTL is the time we keep the evaluation in the cache before we consider it as obsolete.
  // If you want to keep the value forever you can set the FlagCacheTTL field to -1
  private readonly cacheTTL?: number;

  // dataFlushInterval interval time (in millisecond) we use to call the relay proxy to collect data.
  private readonly dataFlushInterval: number;

  // disableDataCollection set to true if you don't want to collect the usage of flags retrieved in the cache.
  private readonly disableDataCollection: boolean;

  // logger is the Open Feature logger to use
  private logger?: Logger;

  constructor(options: GoFeatureFlagProviderOptions, logger?: Logger) {
    this.timeout = options.timeout || 0; // default is 0 = no timeout
    this.endpoint = options.endpoint;
    this.cacheTTL = options.flagCacheTTL !== undefined && options.flagCacheTTL !== 0 ? options.flagCacheTTL : 1000 * 60;
    this.dataFlushInterval = options.dataFlushInterval || 1000 * 60;
    this.disableDataCollection = options.disableDataCollection || false;
    this.logger = logger;

    // Add API key to the headers
    if (options.apiKey) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${options.apiKey}`;
    }

    if (!options.disableCache) {
      const cacheSize = options.flagCacheSize !== undefined && options.flagCacheSize !== 0 ? options.flagCacheSize : 10000;
      this.cache = new LRUCache({maxSize: cacheSize, sizeCalculation: () => 1});
    }
  }

  /**
   * initialize is called everytime the provider is instanced inside GO Feature Flag.
   * It will start the background process for data collection to be able to run every X ms.
   */
  async initialize() {
    if (!this.disableDataCollection) {
      this.bgScheduler = setInterval(async () => await this.callGoffDataCollection(), this.dataFlushInterval)
      this.dataCollectorBuffer = []
    }
  }

  /**
   * onClose is called everytime OpenFeature.Close() function is called.
   * It will terminate gracefully the provider and ensure that all the data are send to the relay-proxy.
   */
  async onClose() {
    if (this.cache !== undefined && this.bgScheduler !== undefined) {
      // we stop the background task to call the data collector endpoint
      clearInterval(this.bgScheduler);
      // We call the data collector with what is still in the buffer.
      await this.callGoffDataCollection()
    }
  }


  /**
   * callGoffDataCollection is a function called periodically to send the usage of the flag to the
   * central service in charge of collecting the data.
   */
  async callGoffDataCollection() {
    if (this.dataCollectorBuffer?.length === 0) {
      return;
    }

    const dataToSend = _.cloneDeep<FeatureEvent<any>[] | undefined>(this.dataCollectorBuffer) || [];
    this.dataCollectorBuffer = [];

    const request: DataCollectorRequest<boolean> = {events: dataToSend, meta: this.dataCollectorMetadata,}
    const endpointURL = new URL(this.endpoint);
    endpointURL.pathname = 'v1/data/collector';

    try {
      await axios.post<DataCollectorResponse>(endpointURL.toString(), request, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: this.timeout,
      });
    } catch (e) {
      this.logger?.error(`impossible to send the data to the collector: ${e}`)
      // if we have an issue calling the collector we put the data back in the buffer
      this.dataCollectorBuffer = [...this.dataCollectorBuffer, ...dataToSend];
    }
  }

  /**
   * resolveBooleanEvaluation is calling the GO Feature Flag relay-proxy API and return a boolean value.
   * @param flagKey - name of your feature flag key.
   * @param defaultValue - default value is used if we are not able to evaluate the flag for this user.
   * @param context - the context used for flag evaluation.
   * @return {Promise<ResolutionDetails<boolean>>} An object containing the result of the flag evaluation by GO Feature Flag.
   * @throws {ProxyNotReady} When we are not able to communicate with the relay-proxy
   * @throws {ProxyTimeout} When the HTTP call is timing out
   * @throws {UnknownError} When an unknown error occurs
   * @throws {TypeMismatchError} When the type of the variation is not the one expected
   * @throws {FlagNotFoundError} When the flag does not exist
   */
  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext
  ): Promise<ResolutionDetails<boolean>> {
    return this.resolveEvaluationGoFeatureFlagProxy<boolean>(
      flagKey,
      defaultValue,
      transformContext(context),
      'boolean'
    );
  }

  /**
   * resolveStringEvaluation is calling the GO Feature Flag relay-proxy API and return a string value.
   * @param flagKey - name of your feature flag key.
   * @param defaultValue - default value is used if we are not able to evaluate the flag for this user.
   * @param context - the context used for flag evaluation.
   * @return {Promise<ResolutionDetails<string>>} An object containing the result of the flag evaluation by GO Feature Flag.
   * @throws {ProxyNotReady} When we are not able to communicate with the relay-proxy
   * @throws {ProxyTimeout} When the HTTP call is timing out
   * @throws {UnknownError} When an unknown error occurs
   * @throws {TypeMismatchError} When the type of the variation is not the one expected
   * @throws {FlagNotFoundError} When the flag does not exist
   */
  async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext
  ): Promise<ResolutionDetails<string>> {
    return this.resolveEvaluationGoFeatureFlagProxy<string>(
      flagKey,
      defaultValue,
      transformContext(context),
      'string'
    );
  }

  /**
   * resolveNumberEvaluation is calling the GO Feature Flag relay-proxy API and return a number value.
   * @param flagKey - name of your feature flag key.
   * @param defaultValue - default value is used if we are not able to evaluate the flag for this user.
   * @param context - the context used for flag evaluation.
   * @return {Promise<ResolutionDetails<number>>} An object containing the result of the flag evaluation by GO Feature Flag.
   * @throws {ProxyNotReady} When we are not able to communicate with the relay-proxy
   * @throws {ProxyTimeout} When the HTTP call is timing out
   * @throws {UnknownError} When an unknown error occurs
   * @throws {TypeMismatchError} When the type of the variation is not the one expected
   * @throws {FlagNotFoundError} When the flag does not exist
   */
  async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext
  ): Promise<ResolutionDetails<number>> {
    return this.resolveEvaluationGoFeatureFlagProxy<number>(
      flagKey,
      defaultValue,
      transformContext(context),
      'number'
    );
  }

  /**
   * resolveObjectEvaluation is calling the GO Feature Flag relay-proxy API and return an object.
   * @param flagKey - name of your feature flag key.
   * @param defaultValue - default value is used if we are not able to evaluate the flag for this user.
   * @param context - the context used for flag evaluation.
   * @return {Promise<ResolutionDetails<U extends JsonValue>>} An object containing the result of the flag evaluation by GO Feature Flag.
   * @throws {ProxyNotReady} When we are not able to communicate with the relay-proxy
   * @throws {ProxyTimeout} When the HTTP call is timing out
   * @throws {UnknownError} When an unknown error occurs
   * @throws {TypeMismatchError} When the type of the variation is not the one expected
   * @throws {FlagNotFoundError} When the flag does not exist
   */
  async resolveObjectEvaluation<U extends JsonValue>(
    flagKey: string,
    defaultValue: U,
    context: EvaluationContext
  ): Promise<ResolutionDetails<U>> {
    return this.resolveEvaluationGoFeatureFlagProxy<U>(
      flagKey,
      defaultValue,
      transformContext(context),
      'object'
    );
  }

  /**
   * resolveEvaluationGoFeatureFlagProxy is a generic function the call the GO Feature Flag relay-proxy API
   * to evaluate the flag.
   * This is the same call for all types of flags so this function also checks if the return call is the one expected.
   * @param flagKey - name of your feature flag key.
   * @param defaultValue - default value is used if we are not able to evaluate the flag for this user.
   * @param user - the user against who we will evaluate the flag.
   * @param expectedType - the type we expect the result to be
   * @return {Promise<ResolutionDetails<T>>} An object containing the result of the flag evaluation by GO Feature Flag.
   * @throws {ProxyNotReady} When we are not able to communicate with the relay-proxy
   * @throws {ProxyTimeout} When the HTTP call is timing out
   * @throws {UnknownError} When an unknown error occurs
   * @throws {TypeMismatchError} When the type of the variation is not the one expected
   * @throws {FlagNotFoundError} When the flag does not exist
   */
  async resolveEvaluationGoFeatureFlagProxy<T>(
    flagKey: string,
    defaultValue: T,
    user: GoFeatureFlagUser,
    expectedType: string
  ): Promise<ResolutionDetails<T>> {
    const cacheKey = `${flagKey}-${user.key}`;
    // check if flag is available in the cache
    if (this.cache !== undefined) {
      const cacheValue = this.cache.get(cacheKey);
      if (cacheValue !== undefined) {
        // Building and inserting an event to the data collector buffer,
        // so we will be able to bulk send these events to GO Feature Flag.
        const dataCollectorEvent: FeatureEvent<T> = {
          contextKind: user.anonymous ? 'anonymousUser' : 'user',
          kind: 'feature',
          creationDate: Math.round(Date.now() / 1000),
          default: false,
          key: flagKey,
          value: cacheValue.value,
          variation: cacheValue.variant || 'SdkDefault',
          userKey: user.key,
        }
        this.dataCollectorBuffer?.push(dataCollectorEvent);
        cacheValue.reason = StandardResolutionReasons.CACHED;
        return cacheValue;
      }
    }

    const request: GoFeatureFlagProxyRequest<T> = {user, defaultValue};
    // build URL to access to the endpoint
    const endpointURL = new URL(this.endpoint);
    endpointURL.pathname = `v1/feature/${flagKey}/eval`;

    let apiResponseData: GoFeatureFlagProxyResponse<T>;
    try {
      const response = await axios.post<GoFeatureFlagProxyResponse<T>>(endpointURL.toString(), request, {
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: this.timeout,
      });
      apiResponseData = response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status == 401) {
        throw new Unauthorized('invalid token used to contact GO Feature Flag relay proxy instance');
      }
      // Impossible to contact the relay-proxy
      if (
        axios.isAxiosError(error) &&
        (error.code === 'ECONNREFUSED' || error.response?.status === 404)
      ) {
        throw new ProxyNotReady(
          `impossible to call go-feature-flag relay proxy on ${endpointURL}`,
          error
        );
      }

      // Timeout when calling the API
      if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
        throw new ProxyTimeout(
          `impossible to retrieve the ${flagKey} on time`,
          error
        );
      }

      throw new UnknownError(
        `unknown error while retrieving flag ${flagKey} for user ${user.key}`,
        error
      );
    }

    // Check that we received the expectedType
    if (typeof apiResponseData.value !== expectedType) {
      throw new TypeMismatchError(
        `Flag value ${flagKey} had unexpected type ${typeof apiResponseData.value}, expected ${expectedType}.`
      );
    }

    // Case of the flag is not found
    if (apiResponseData.errorCode === ErrorCode.FLAG_NOT_FOUND) {
      throw new FlagNotFoundError(
        `Flag ${flagKey} was not found in your configuration`
      );
    }

    // Case of the flag is disabled
    if (apiResponseData.reason === StandardResolutionReasons.DISABLED) {
      // we don't set a variant since we are using the default value, and we are not able to know
      // which variant it is.
      return {value: defaultValue, reason: apiResponseData.reason};
    }

    const sdkResponse: ResolutionDetails<T> = {
      value: apiResponseData.value,
      variant: apiResponseData.variationType,
      reason: apiResponseData.reason?.toString() || 'UNKNOWN',
      flagMetadata: apiResponseData.metadata || undefined,
    };
    if (Object.values(ErrorCode).includes(apiResponseData.errorCode as ErrorCode)) {
      sdkResponse.errorCode = ErrorCode[apiResponseData.errorCode as ErrorCode];
    } else if (apiResponseData.errorCode) {
      sdkResponse.errorCode = ErrorCode.GENERAL;
    }

    if (this.cache !== undefined && apiResponseData.cacheable) {
      if (this.cacheTTL === -1) {
        this.cache.set(cacheKey, sdkResponse)
      } else {
        this.cache.set(cacheKey, sdkResponse, {ttl: this.cacheTTL})
      }
    }
    return sdkResponse;
  }
}

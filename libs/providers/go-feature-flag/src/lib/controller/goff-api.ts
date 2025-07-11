import type {
  DataCollectorRequest,
  DataCollectorResponse,
  ExporterMetadataValue,
  FeatureEvent,
  GoFeatureFlagProviderOptions,
  GoFeatureFlagProxyRequest,
  GoFeatureFlagProxyResponse,
} from '../model';
import { ConfigurationChange } from '../model';
import type { EvaluationContext, Logger, ResolutionDetails } from '@openfeature/server-sdk';
import { ErrorCode, FlagNotFoundError, StandardResolutionReasons, TypeMismatchError } from '@openfeature/server-sdk';
import { transformContext } from '../context-transformer';
import axios, { isAxiosError } from 'axios';
import { Unauthorized } from '../errors/unauthorized';
import { ProxyNotReady } from '../errors/proxyNotReady';
import { ProxyTimeout } from '../errors/proxyTimeout';
import { UnknownError } from '../errors/unknownError';
import { CollectorError } from '../errors/collector-error';
import { ConfigurationChangeEndpointNotFound } from '../errors/configuration-change-endpoint-not-found';
import { ConfigurationChangeEndpointUnknownErr } from '../errors/configuration-change-endpoint-unknown-err';
import { GoFeatureFlagError } from '../errors/goff-error';

export class GoffApiController {
  // endpoint of your go-feature-flag relay proxy instance
  private readonly endpoint: string;

  // timeout in millisecond before we consider the request as a failure
  private readonly timeout: number;
  // logger is the Open Feature logger to use
  private logger?: Logger;

  // etag is the etag of the last configuration change
  private etag: string | null = null;

  constructor(options: GoFeatureFlagProviderOptions, logger?: Logger) {
    this.endpoint = options.endpoint;
    this.timeout = options.timeout ?? 0;
    this.logger = logger;
    // Add API key to the headers
    if (options.apiKey) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${options.apiKey}`;
    }
  }

  /**
   * Call the GO Feature Flag API to evaluate a flag
   * @param flagKey
   * @param defaultValue
   * @param evaluationContext
   * @param expectedType
   * @param exporterMetadata
   */
  async evaluate<T>(
    flagKey: string,
    defaultValue: T,
    evaluationContext: EvaluationContext,
    expectedType: string,
    exporterMetadata: Record<string, ExporterMetadataValue> = {},
  ): Promise<{ resolutionDetails: ResolutionDetails<T>; isCacheable: boolean }> {
    const goffEvaluationContext = transformContext(evaluationContext);

    // build URL to access to the endpoint
    const endpointURL = new URL(this.endpoint);
    endpointURL.pathname = `v1/feature/${flagKey}/eval`;

    if (goffEvaluationContext.custom === undefined) {
      goffEvaluationContext.custom = {};
    }
    goffEvaluationContext.custom['gofeatureflag'] = {
      exporterMetadata: {
        openfeature: true,
        provider: 'js',
        ...exporterMetadata,
      },
    };

    const request: GoFeatureFlagProxyRequest<T> = {
      evaluationContext: goffEvaluationContext,
      defaultValue,
    };
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
      if (axios.isAxiosError(error) && (error.code === 'ECONNREFUSED' || error.response?.status === 404)) {
        throw new ProxyNotReady(`impossible to call go-feature-flag relay proxy on ${endpointURL}`, error);
      }

      // Timeout when calling the API
      if (axios.isAxiosError(error) && error.code === 'ECONNABORTED') {
        throw new ProxyTimeout(`impossible to retrieve the ${flagKey} on time`, error);
      }

      throw new UnknownError(
        `unknown error while retrieving flag ${flagKey} for evaluation context ${evaluationContext.targetingKey}`,
        error,
      );
    }
    // Check that we received the expectedType
    if (typeof apiResponseData.value !== expectedType) {
      throw new TypeMismatchError(
        `Flag value ${flagKey} had unexpected type ${typeof apiResponseData.value}, expected ${expectedType}.`,
      );
    }
    // Case of the flag is not found
    if (apiResponseData.errorCode === ErrorCode.FLAG_NOT_FOUND) {
      throw new FlagNotFoundError(`Flag ${flagKey} was not found in your configuration`);
    }

    // Case of the flag is disabled
    if (apiResponseData.reason === StandardResolutionReasons.DISABLED) {
      // we don't set a variant since we are using the default value, and we are not able to know
      // which variant it is.
      return {
        resolutionDetails: { value: defaultValue, reason: apiResponseData.reason },
        isCacheable: true,
      };
    }

    if (apiResponseData.reason === StandardResolutionReasons.ERROR) {
      return {
        resolutionDetails: {
          value: defaultValue,
          reason: apiResponseData.reason,
          errorCode: this.convertErrorCode(apiResponseData.errorCode),
        },
        isCacheable: true,
      };
    }

    return {
      resolutionDetails: {
        value: apiResponseData.value,
        variant: apiResponseData.variationType,
        reason: apiResponseData.reason?.toString() || 'UNKNOWN',
        flagMetadata: apiResponseData.metadata || undefined,
        errorCode: this.convertErrorCode(apiResponseData.errorCode),
      },
      isCacheable: apiResponseData.cacheable,
    };
  }

  async collectData(events: FeatureEvent<any>[], dataCollectorMetadata: Record<string, ExporterMetadataValue>) {
    if (events?.length === 0) {
      return;
    }

    const request: DataCollectorRequest<boolean> = { events: events, meta: dataCollectorMetadata };
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
      throw new CollectorError(`impossible to send the data to the collector: ${e}`);
    }
  }

  public async configurationHasChanged(): Promise<ConfigurationChange> {
    const endpointURL = new URL(this.endpoint);
    endpointURL.pathname = 'v1/flag/change';

    const headers: any = {
      'Content-Type': 'application/json',
    };

    if (this.etag) {
      headers['If-None-Match'] = this.etag;
    }
    try {
      const response = await axios.get(endpointURL.toString(), { headers });
      if (response.status === 304) {
        return ConfigurationChange.FLAG_CONFIGURATION_NOT_CHANGED;
      }

      const isInitialConfiguration = this.etag === null;
      this.etag = response.headers['etag'];
      return isInitialConfiguration
        ? ConfigurationChange.FLAG_CONFIGURATION_INITIALIZED
        : ConfigurationChange.FLAG_CONFIGURATION_UPDATED;
    } catch (e) {
      if (isAxiosError(e) && e.response?.status === 304) {
        return ConfigurationChange.FLAG_CONFIGURATION_NOT_CHANGED;
      }
      if (isAxiosError(e) && e.response?.status === 404) {
        throw new ConfigurationChangeEndpointNotFound('impossible to find the configuration change endpoint');
      }
      if (e instanceof GoFeatureFlagError) {
        throw e;
      }
      throw new ConfigurationChangeEndpointUnknownErr(
        'unknown error while retrieving the configuration change endpoint',
        e as Error,
      );
    }
  }

  private convertErrorCode(errorCode: ErrorCode | undefined): ErrorCode | undefined {
    if ((errorCode as string) === '') {
      return undefined;
    }
    if (errorCode === undefined) {
      return undefined;
    }
    if (Object.values(ErrorCode).includes(errorCode as ErrorCode)) {
      return ErrorCode[errorCode as ErrorCode];
    }
    return ErrorCode.GENERAL;
  }
}

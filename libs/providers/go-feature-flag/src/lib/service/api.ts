import { type FetchAPI, isomorphicFetch } from '../helper/fetch-api';
import type { GoFeatureFlagProviderOptions } from '../go-feature-flag-provider-options';
import type { ExporterMetadata, ExporterRequest, ExportEvent, FlagConfigRequest, FlagConfigResponse } from '../model';
import type { Logger } from '@openfeature/server-sdk';
import {
  APPLICATION_JSON,
  BEARER_TOKEN,
  HTTP_HEADER_AUTHORIZATION,
  HTTP_HEADER_CONTENT_TYPE,
  HTTP_HEADER_ETAG,
  HTTP_HEADER_IF_NONE_MATCH,
  HTTP_HEADER_LAST_MODIFIED,
  HTTP_STATUS,
} from '../helper/constants';
import {
  FlagConfigurationEndpointNotFoundException,
  GoFeatureFlagException,
  ImpossibleToRetrieveConfigurationException,
  ImpossibleToSendDataToTheCollectorException,
  InvalidOptionsException,
  UnauthorizedException,
} from '../exception';

/**
 * GOFeatureFlagApi is a class that provides methods to interact with the GO Feature Flag API.
 */
export class GoFeatureFlagApi {
  private readonly endpoint: string;
  private readonly timeout: number;
  private readonly apiKey?: string;
  private readonly fetchImplementation: FetchAPI;
  private readonly logger?: Logger;

  /**
   * Constructor for GoFeatureFlagApi.
   * @param options Options provided during the initialization of the provider
   * @throws Error when options are not provided
   */
  constructor(options: GoFeatureFlagProviderOptions, logger?: Logger) {
    if (!options) {
      throw new InvalidOptionsException('Options cannot be null');
    }

    this.endpoint = options.endpoint;
    this.timeout = options.timeout || 10000;
    this.apiKey = options.apiKey;
    this.fetchImplementation = options.fetchImplementation || isomorphicFetch();
    this.logger = logger;
  }

  /**
   * RetrieveFlagConfiguration is a method that retrieves the flag configuration from the GO Feature Flag API.
   * @param etag If provided, we call the API with "If-None-Match" header.
   * @param flags List of flags to retrieve, if not set or empty, we will retrieve all available flags.
   * @returns A FlagConfigResponse returning the success data.
   * @throws FlagConfigurationEndpointNotFoundException if the endpoint is not reachable.
   * @throws ImpossibleToRetrieveConfigurationException if the endpoint is returning an error.
   */
  async retrieveFlagConfiguration(etag?: string, flags?: string[]): Promise<FlagConfigResponse> {
    const requestBody: FlagConfigRequest = { flags: flags || [] };
    const requestStr = JSON.stringify(requestBody);

    const headers: Record<string, string> = {
      [HTTP_HEADER_CONTENT_TYPE]: APPLICATION_JSON,
    };

    // Adding the If-None-Match header if etag is provided
    if (etag) {
      headers[HTTP_HEADER_IF_NONE_MATCH] = etag;
    }

    // Add authorization header if API key is provided
    if (this.apiKey) {
      headers[HTTP_HEADER_AUTHORIZATION] = `${BEARER_TOKEN}${this.apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await this.fetchImplementation(`${this.endpoint}/v1/flag/configuration`, {
        method: 'POST',
        headers,
        body: requestStr,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      switch (response.status) {
        case HTTP_STATUS.OK:
        case HTTP_STATUS.NOT_MODIFIED: {
          const body = await response.text();
          return this.handleFlagConfigurationSuccess(response, body);
        }
        case HTTP_STATUS.NOT_FOUND:
          throw new FlagConfigurationEndpointNotFoundException();
        case HTTP_STATUS.UNAUTHORIZED:
        case HTTP_STATUS.FORBIDDEN:
          throw new UnauthorizedException(
            'Impossible to retrieve flag configuration: authentication/authorization error',
          );
        case HTTP_STATUS.BAD_REQUEST: {
          const badRequestErrBody = await response.text();
          throw new ImpossibleToRetrieveConfigurationException(
            `retrieve flag configuration error: Bad request: ${badRequestErrBody}`,
          );
        }
        default: {
          const defaultErrBody = (await response.text()) || '';
          throw new ImpossibleToRetrieveConfigurationException(
            `retrieve flag configuration error: unexpected http code ${response.status}: ${defaultErrBody}`,
          );
        }
      }
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof GoFeatureFlagException) {
        throw error;
      }
      throw new ImpossibleToRetrieveConfigurationException(`Network error: ${error}`);
    }
  }

  /**
   * Sends a list of events to the GO Feature Flag data collector.
   * @param eventsList List of events
   * @param exporterMetadata Metadata associated.
   * @throws UnauthorizedException when we are not authorized to call the API
   * @throws ImpossibleToSendDataToTheCollectorException when an error occurred when calling the API
   */
  async sendEventToDataCollector(eventsList: ExportEvent[], exporterMetadata: ExporterMetadata): Promise<void> {
    const requestBody: ExporterRequest = {
      meta: exporterMetadata?.asObject() ?? {},
      events: eventsList,
    };

    const requestStr = JSON.stringify(requestBody);

    const headers: Record<string, string> = {
      [HTTP_HEADER_CONTENT_TYPE]: APPLICATION_JSON,
    };

    // Add authorization header if API key is provided
    if (this.apiKey) {
      headers[HTTP_HEADER_AUTHORIZATION] = `${BEARER_TOKEN}${this.apiKey}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await this.fetchImplementation(`${this.endpoint}/v1/data/collector`, {
        method: 'POST',
        headers,
        body: requestStr,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      switch (response.status) {
        case HTTP_STATUS.OK: {
          const body = await response.text();
          this.logger?.info(`Published ${eventsList.length} events successfully: ${body}`);
          return;
        }
        case HTTP_STATUS.UNAUTHORIZED:
        case HTTP_STATUS.FORBIDDEN:
          throw new UnauthorizedException('Impossible to send events: authentication/authorization error');
        case HTTP_STATUS.BAD_REQUEST: {
          const badRequestErrBody = await response.text();
          throw new ImpossibleToSendDataToTheCollectorException(`Bad request: ${badRequestErrBody}`);
        }
        default: {
          const defaultErrBody = (await response.text()) || '';
          throw new ImpossibleToSendDataToTheCollectorException(
            `send data to the collector error: unexpected http code ${response.status}: ${defaultErrBody}`,
          );
        }
      }
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof GoFeatureFlagException) {
        throw error;
      }
      throw new ImpossibleToSendDataToTheCollectorException(`Network error: ${error}`);
    }
  }

  /**
   * HandleFlagConfigurationSuccess is handling the success response of the flag configuration request.
   * @param response HTTP response.
   * @param body String of the body.
   * @returns A FlagConfigResponse object.
   */
  private handleFlagConfigurationSuccess(response: Response, body: string): FlagConfigResponse {
    const etagHeader = response.headers.get(HTTP_HEADER_ETAG) || undefined;
    const lastModifiedHeader = response.headers.get(HTTP_HEADER_LAST_MODIFIED);
    const lastUpdated = lastModifiedHeader ? new Date(lastModifiedHeader) : new Date(0);

    const result: FlagConfigResponse = {
      etag: etagHeader,
      lastUpdated,
      flags: {},
      evaluationContextEnrichment: {},
    };

    if (response.status === HTTP_STATUS.NOT_MODIFIED) {
      return result;
    }

    try {
      const goffResp = JSON.parse(body) as FlagConfigResponse;
      result.evaluationContextEnrichment = goffResp.evaluationContextEnrichment || {};
      result.flags = goffResp.flags || {};
    } catch (error) {
      this.logger?.warn(`Failed to parse flag configuration response: ${error}. Response body: "${body}"`);
      // Return the default result with empty flags and enrichment
    }
    return result;
  }
}

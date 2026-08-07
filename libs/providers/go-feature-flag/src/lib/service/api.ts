import { type FetchAPI, isomorphicFetch } from '../helper/fetch-api';
import type { GoFeatureFlagProviderOptions } from '../go-feature-flag-provider-options';
import type {
  ExporterMetadata,
  ExporterRequest,
  ExportEvent,
  FlagConfigRequest,
  FlagConfigResponse,
  FlagConfigurationResult,
} from '../model';
import { NOT_MODIFIED } from '../model';
import type { Logger } from '@openfeature/server-sdk';
import {
  APPLICATION_JSON,
  HTTP_HEADER_API_KEY,
  HTTP_HEADER_CONTENT_TYPE,
  HTTP_HEADER_ETAG,
  HTTP_HEADER_IF_NONE_MATCH,
  HTTP_HEADER_LAST_MODIFIED,
  HTTP_STATUS,
} from '../helper/constants';
import { buildRequestHeaders } from '../helper/headers';
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
  /** Caller-supplied headers, merged into every request to the relay proxy. */
  private readonly customHeaders?: Record<string, string>;

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
    this.customHeaders = options.headers;
  }

  /**
   * RetrieveFlagConfiguration is a method that retrieves the flag configuration from the GO Feature Flag API.
   * @param etag If provided, we call the API with "If-None-Match" header.
   * @param flags List of flags to retrieve, if not set or empty, we will retrieve all available flags.
   * @returns A FlagConfigResponse with the new configuration, or the NOT_MODIFIED sentinel when the
   * relay proxy reports that nothing has changed.
   * @throws FlagConfigurationEndpointNotFoundException if the endpoint is not reachable.
   * @throws ImpossibleToRetrieveConfigurationException if the endpoint is returning an error, or
   * returns a body we cannot use as a configuration.
   */
  async retrieveFlagConfiguration(etag?: string, flags?: string[]): Promise<FlagConfigurationResult> {
    const requestBody: FlagConfigRequest = { flags: flags || [] };
    const requestStr = JSON.stringify(requestBody);

    const ownedHeaders: Record<string, string> = {
      [HTTP_HEADER_CONTENT_TYPE]: APPLICATION_JSON,
    };

    // Adding the If-None-Match header if etag is provided
    if (etag) {
      ownedHeaders[HTTP_HEADER_IF_NONE_MATCH] = etag;
    }

    // Truthiness, not a presence check: an empty apiKey must send no authentication header at all.
    if (this.apiKey) {
      ownedHeaders[HTTP_HEADER_API_KEY] = this.apiKey;
    }

    const headers = buildRequestHeaders(ownedHeaders, this.customHeaders);

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
        case HTTP_STATUS.NOT_MODIFIED:
          // Deliberately returned before reading the body or any header: a 304 must not be able to
          // carry flags, enrichment, a timestamp or an ETag back to the caller. Returning a
          // sentinel rather than an empty response object is what keeps the caller from mistaking
          // "nothing changed" for "the configuration is now empty".
          return NOT_MODIFIED;
        case HTTP_STATUS.OK: {
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

    const ownedHeaders: Record<string, string> = {
      [HTTP_HEADER_CONTENT_TYPE]: APPLICATION_JSON,
    };

    if (this.apiKey) {
      ownedHeaders[HTTP_HEADER_API_KEY] = this.apiKey;
    }

    const headers = buildRequestHeaders(ownedHeaders, this.customHeaders);

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
   * HandleFlagConfigurationSuccess is handling the 200 response of the flag configuration request.
   *
   * Anything that leaves us without a usable flag map is reported as a failed refresh rather than
   * as an empty configuration. Returning empty flags here would make the caller overwrite the live
   * configuration and advance the stored ETag, so the next poll would be answered with a 304 and
   * the empty state would become permanent.
   * @param response HTTP response.
   * @param body String of the body.
   * @returns A FlagConfigResponse object.
   * @throws ImpossibleToRetrieveConfigurationException if the body cannot be parsed, or carries no
   * flag map.
   */
  private handleFlagConfigurationSuccess(response: Response, body: string): FlagConfigResponse {
    const etagHeader = response.headers.get(HTTP_HEADER_ETAG) || undefined;
    const lastModifiedHeader = response.headers.get(HTTP_HEADER_LAST_MODIFIED);
    const lastUpdated = lastModifiedHeader ? new Date(lastModifiedHeader) : new Date(0);

    let goffResp: FlagConfigResponse | null;
    try {
      goffResp = JSON.parse(body) as FlagConfigResponse | null;
    } catch (error) {
      throw new ImpossibleToRetrieveConfigurationException(
        `retrieve flag configuration error: impossible to parse the response body: ${error}`,
      );
    }

    // An absent or null flag map tells us nothing about the flags, so we keep what we already have.
    // An explicitly empty map is a legitimate configuration and is accepted as one.
    if (goffResp?.flags === undefined || goffResp.flags === null) {
      throw new ImpossibleToRetrieveConfigurationException(
        'retrieve flag configuration error: the response contains no flag configuration',
      );
    }

    return {
      etag: etagHeader,
      lastUpdated,
      flags: goffResp.flags,
      evaluationContextEnrichment: goffResp.evaluationContextEnrichment || {},
    };
  }
}

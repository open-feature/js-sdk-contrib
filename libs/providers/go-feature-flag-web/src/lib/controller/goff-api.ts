import { DataCollectorRequest, ExporterMetadataValue, FeatureEvent, GoFeatureFlagWebProviderOptions } from '../model';
import { CollectorError } from '../errors/collector-error';

export class GoffApiController {
  // endpoint of your go-feature-flag relay proxy instance
  private readonly endpoint: string;

  // timeout in millisecond before we consider the request as a failure
  private readonly timeout: number;
  private options: GoFeatureFlagWebProviderOptions;

  constructor(options: GoFeatureFlagWebProviderOptions) {
    this.endpoint = options.endpoint;
    this.timeout = options.apiTimeout ?? 0;
    this.options = options;
  }

  async collectData(events: FeatureEvent<any>[], dataCollectorMetadata: Record<string, ExporterMetadataValue>) {
    if (events?.length === 0) {
      return;
    }

    const request: DataCollectorRequest<boolean> = { events: events, meta: dataCollectorMetadata };
    const endpointURL = new URL(this.endpoint);
    endpointURL.pathname = 'v1/data/collector';

    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      if (this.options.apiKey) {
        headers['Authorization'] = `Bearer ${this.options.apiKey}`;
      }

      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), this.timeout ?? 10000);
      const response = await fetch(endpointURL.toString(), {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      clearTimeout(id);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (e) {
      throw new CollectorError(`impossible to send the data to the collector: ${e}`);
    }
  }
}

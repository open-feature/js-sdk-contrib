import type { Logger } from '@openfeature/web-sdk';
import type { ExporterMetadataValue, FeatureEvent, GoFeatureFlagWebProviderOptions, TrackingEvent } from './model';
import { GoffApiController } from './controller/goff-api';
import { CollectorError } from './errors/collector-error';
import { copy } from 'copy-anything';

type Timer = ReturnType<typeof setInterval>;

export class CollectorManager {
  // bgSchedulerId contains the id of the setInterval that is running.
  private bgScheduler?: Timer;
  // dataCollectorBuffer contains all the FeatureEvents that we need to send to the relay-proxy for data collection.
  private dataCollectorBuffer?: Array<FeatureEvent<any> | TrackingEvent>;
  // dataFlushInterval interval time (in millisecond) we use to call the relay proxy to collect data.
  private readonly dataFlushInterval: number;
  // logger is the Open Feature logger to use
  private logger?: Logger;
  // dataCollectorMetadata are the metadata used when calling the data collector endpoint
  private readonly dataCollectorMetadata: Record<string, ExporterMetadataValue>;

  private readonly goffApiController: GoffApiController;

  constructor(options: GoFeatureFlagWebProviderOptions, logger?: Logger) {
    this.dataFlushInterval = options.dataFlushInterval || 1000 * 60;
    this.logger = logger;
    this.goffApiController = new GoffApiController(options);

    this.dataCollectorMetadata = {
      provider: 'web',
      openfeature: true,
      ...options.exporterMetadata,
    };
  }

  init() {
    this.bgScheduler = setInterval(async () => await this.callGoffDataCollection(), this.dataFlushInterval);
    this.dataCollectorBuffer = [];
  }

  async close() {
    clearInterval(this.bgScheduler);
    // We call the data collector with what is still in the buffer.
    await this.callGoffDataCollection();
  }

  add(event: FeatureEvent<any> | TrackingEvent) {
    if (this.dataCollectorBuffer) {
      this.dataCollectorBuffer.push(event);
    }
  }

  /**
   * callGoffDataCollection is a function called periodically to send the usage of the flag to the
   * central service in charge of collecting the data.
   */
  async callGoffDataCollection() {
    const dataToSend = copy(this.dataCollectorBuffer) || [];
    this.dataCollectorBuffer = [];
    try {
      await this.goffApiController.collectData(dataToSend, this.dataCollectorMetadata);
    } catch (e) {
      if (!(e instanceof CollectorError)) {
        throw e;
      }
      this.logger?.error(e);
      // if we have an issue calling the collector, we put the data back in the buffer
      this.dataCollectorBuffer = [...this.dataCollectorBuffer, ...dataToSend];
      return;
    }
  }
}

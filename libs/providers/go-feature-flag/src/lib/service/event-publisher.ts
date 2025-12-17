import type { GoFeatureFlagProviderOptions } from '../go-feature-flag-provider-options';
import type { GoFeatureFlagApi } from './api';
import type { Logger } from '@openfeature/server-sdk';
import { ExporterMetadata, type ExportEvent } from '../model';
import { InvalidOptionsException } from '../exception';
import { DEFAULT_FLUSH_INTERVAL_MS, DEFAULT_MAX_PENDING_EVENTS } from '../helper/constants';

/**
 * EventPublisher is used to collect events and publish them in batch before they are published.
 */
export class EventPublisher {
  /** The API used to communicate with the GO Feature Flag relay proxy. */
  private readonly api: GoFeatureFlagApi;
  /** The options for the event publisher. */
  private readonly options: GoFeatureFlagProviderOptions;
  /** The events to publish. */
  private readonly events: ExportEvent[] = [];
  /** The interval ID for the periodic runner. */
  private intervalId?: ReturnType<typeof setTimeout>;
  /** Whether the event publisher is running. */
  private isRunning = false;
  /** The logger to use for logging. */
  private readonly logger?: Logger;

  /**
   * Initialize the event publisher with a specified publication interval.
   * @param {GoFeatureFlagApi} api - The API used to communicate with the GO Feature Flag relay proxy.
   * @param {GoFeatureFlagProviderOptions} options - The options to initialise the provider.
   * @throws {InvalidOptionsException} If api or options are null.
   */
  constructor(api: GoFeatureFlagApi, options: GoFeatureFlagProviderOptions, logger?: Logger) {
    if (!api) {
      throw new InvalidOptionsException('API cannot be null');
    }
    if (!options) {
      throw new InvalidOptionsException('Options cannot be null');
    }
    this.api = api;
    this.options = options;
    this.logger = logger;
  }

  /**
   * Starts the periodic runner that publishes events.
   * @returns {Promise<void>} A promise that resolves when the periodic runner has started.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }
    this.isRunning = true;
    this.runPublisher();
  }

  /**
   * Runs the publisher and sets up a periodic runner.
   * @returns {Promise<void>} A promise that resolves when the publisher has run.
   */
  private async runPublisher(): Promise<void> {
    await this.publishEvents();
    if (this.isRunning) {
      const flushInterval = this.options.dataFlushInterval || DEFAULT_FLUSH_INTERVAL_MS;
      this.intervalId = setTimeout(() => this.runPublisher(), flushInterval);
    }
  }

  /**
   * Stops the periodic runner that publishes events and flushes any remaining events.
   * @returns {Promise<void>} A promise that resolves when the periodic runner has stopped and all events are published.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    // Publish any remaining events
    await this.publishEvents();
  }

  /**
   * Add event for aggregation before publishing. If the max pending events is reached, events are published immediately.
   * @param {ExportEvent} eventToAdd - The event to add to the collection.
   * @returns {void}
   */
  addEvent(eventToAdd: ExportEvent): void {
    this.events.push(eventToAdd);
    if (this.events.length >= (this.options.maxPendingEvents || DEFAULT_MAX_PENDING_EVENTS)) {
      // Fire and forget - don't await to avoid blocking
      this.publishEvents().catch((error) => {
        this.logger?.error('Error publishing events:', error);
      });
    }
  }

  /**
   * @private
   * Publishes the collected events to the GO Feature Flag relay proxy.
   * @returns {Promise<void>} A promise that resolves when the events have been published.
   */
  private async publishEvents(): Promise<void> {
    let eventsToPublish: ExportEvent[] = [];
    // Simple thread-safe check and clear
    if (this.events.length === 0) {
      return;
    }
    eventsToPublish = [...this.events];
    this.events.length = 0; // Clear the array
    try {
      await this.api.sendEventToDataCollector(eventsToPublish, this.options.exporterMetadata ?? new ExporterMetadata());
    } catch (error) {
      this.logger?.error('An error occurred while publishing events:', error);
      // Re-add events to the collection on failure
      this.events.push(...eventsToPublish);
    }
  }
}

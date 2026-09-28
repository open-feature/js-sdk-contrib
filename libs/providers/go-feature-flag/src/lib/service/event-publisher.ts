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
  /** The publish currently in flight, if any. Held as a promise so `stop` can join it. */
  private inFlight?: Promise<void>;
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
      clearTimeout(this.intervalId);
      this.intervalId = undefined;
    }
    // A publish already in flight has to settle before the final flush, or single-flight would turn
    // that flush into a no-op and drop everything still buffered at shutdown - including the batch
    // this publish is about to re-queue if it fails.
    await this.inFlight;
    // Publish any remaining events
    await this.publishEvents();
  }

  /** The count at which `addEvent` flushes, and half the buffer's hard cap. */
  private get maxPendingEvents(): number {
    return this.options.maxPendingEvents || DEFAULT_MAX_PENDING_EVENTS;
  }

  /**
   * Trims the buffer to twice `maxPendingEvents`, discarding the oldest events first.
   *
   * Without a cap the buffer grows for the whole duration of a collector outage: every failed
   * publish puts its entire batch back and every evaluation adds another event on top, so the
   * failing request grows along with the memory it holds.
   */
  private enforceCap(): void {
    const cap = 2 * this.maxPendingEvents;
    if (this.events.length <= cap) {
      return;
    }
    const discarded = this.events.length - cap;
    this.events.splice(0, discarded);
    this.logger?.warn(`Data collector buffer is full, discarded the ${discarded} oldest event(s)`);
  }

  /**
   * Add event for aggregation before publishing. If the max pending events is reached, events are published immediately.
   * @param {ExportEvent} eventToAdd - The event to add to the collection.
   * @returns {void}
   */
  addEvent(eventToAdd: ExportEvent): void {
    this.events.push(eventToAdd);
    this.enforceCap();
    if (this.events.length >= this.maxPendingEvents) {
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
    // Single-flight. The periodic runner and the `maxPendingEvents` threshold in `addEvent` are two
    // independent callers, so without this each threshold crossing starts another POST against a
    // collector that is already slow - amplifying an outage instead of backing off. A skipped flush
    // loses nothing: the buffer is still there for the next one.
    if (this.inFlight) {
      return;
    }
    if (this.events.length === 0) {
      return;
    }
    const eventsToPublish = [...this.events];
    this.events.length = 0; // Clear the array

    // Assigned before the first suspension point, so a caller reaching `addEvent` between the drain
    // and the POST cannot slip a second publish past the guard.
    this.inFlight = this.sendBatch(eventsToPublish);
    try {
      await this.inFlight;
    } finally {
      this.inFlight = undefined;
    }
  }

  /**
   * @private
   * Sends a single batch, returning it to the buffer if the collector rejects it.
   * @param {ExportEvent[]} eventsToPublish - The batch drained from the buffer.
   * @returns {Promise<void>} A promise that resolves once the batch has been sent or re-queued.
   */
  private async sendBatch(eventsToPublish: ExportEvent[]): Promise<void> {
    try {
      await this.api.sendEventToDataCollector(eventsToPublish, this.options.exporterMetadata ?? new ExporterMetadata());
    } catch (error) {
      this.logger?.error('An error occurred while publishing events:', error);
      // At the head, not the tail: anything `addEvent` buffered while this POST was in flight is
      // newer than this batch, so appending would file the older events behind the newer ones.
      this.events.unshift(...eventsToPublish);
      this.enforceCap();
    }
  }
}

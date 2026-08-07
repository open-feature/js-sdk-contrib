import { EventPublisher } from './event-publisher';
import type { GoFeatureFlagProviderOptions } from '../go-feature-flag-provider-options';
import { ExporterMetadata, type FeatureEvent, type TrackingEvent } from '../model';
import { InvalidOptionsException } from '../exception';
import { type Logger } from '@openfeature/core';

// Mock the GoFeatureFlagApi
jest.mock('./api');

describe('EventPublisher', () => {
  let eventPublisher: EventPublisher;
  let mockApi: any;
  let mockOptions: GoFeatureFlagProviderOptions;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockApi = {
      sendEventToDataCollector: jest.fn().mockResolvedValue(undefined),
    };

    mockOptions = {
      endpoint: 'http://localhost:1031',
      dataFlushInterval: 100,
      maxPendingEvents: 5,
      exporterMetadata: new ExporterMetadata().add('test', 'metadata'),
    };

    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as any;

    eventPublisher = new EventPublisher(mockApi, mockOptions);
  });

  afterEach(async () => {
    if (eventPublisher) {
      await eventPublisher.stop();
    }
  });

  describe('constructor', () => {
    it('should throw error when api is null', () => {
      expect(() => new EventPublisher(null as any, mockOptions)).toThrow(InvalidOptionsException);
    });

    it('should throw error when options is null', () => {
      expect(() => new EventPublisher(mockApi, null as any)).toThrow(InvalidOptionsException);
    });

    it('should create instance with valid parameters', () => {
      expect(eventPublisher).toBeInstanceOf(EventPublisher);
    });
  });

  describe('start', () => {
    it('should start the periodic publisher', async () => {
      jest.useFakeTimers();

      await eventPublisher.start();

      // Add an event to trigger publishing
      const mockEvent: FeatureEvent = {
        kind: 'feature',
        creationDate: Date.now() / 1000,
        contextKind: 'user',
        key: 'test-flag',
        userKey: 'test-user',
        default: false,
        variation: 'test-variation',
      };
      eventPublisher.addEvent(mockEvent);

      // Fast-forward time to trigger the interval
      jest.advanceTimersByTime(150);

      expect(mockApi.sendEventToDataCollector).toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should not start multiple times', async () => {
      await eventPublisher.start();
      await eventPublisher.start();

      // Should only start once
      expect(eventPublisher).toBeDefined();
    });
  });

  describe('stop', () => {
    it('should stop the periodic publisher', async () => {
      jest.useFakeTimers();

      await eventPublisher.start();
      await eventPublisher.stop();

      // Fast-forward time - should not trigger any more calls
      jest.advanceTimersByTime(150);

      const callCount = mockApi.sendEventToDataCollector.mock.calls.length;

      // Fast-forward again to ensure no more calls
      jest.advanceTimersByTime(150);

      expect(mockApi.sendEventToDataCollector.mock.calls.length).toBe(callCount);

      jest.useRealTimers();
    });

    it('should publish remaining events when stopping', async () => {
      const testPublisher = new EventPublisher(mockApi, mockOptions);

      const mockEvent: FeatureEvent = {
        kind: 'feature',
        creationDate: Date.now() / 1000,
        contextKind: 'user',
        key: 'test-flag',
        userKey: 'test-user',
        default: false,
        variation: 'test-variation',
      };

      // Start the publisher first
      await testPublisher.start();

      // Add event and stop
      testPublisher.addEvent(mockEvent);
      await testPublisher.stop();

      expect(mockApi.sendEventToDataCollector).toHaveBeenCalledWith([mockEvent], mockOptions.exporterMetadata);
    });
  });

  describe('addEvent', () => {
    it('should add event to collection', () => {
      const mockEvent: FeatureEvent = {
        kind: 'feature',
        creationDate: Date.now() / 1000,
        contextKind: 'user',
        key: 'test-flag',
        userKey: 'test-user',
        default: false,
        variation: 'test-variation',
      };

      eventPublisher.addEvent(mockEvent);

      // We can't directly test the internal state, but we can verify it doesn't throw
      expect(() => eventPublisher.addEvent(mockEvent)).not.toThrow();
    });

    it('should add TrackingEvent to collection', () => {
      const mockTrackingEvent: TrackingEvent = {
        kind: 'tracking',
        creationDate: Date.now() / 1000,
        contextKind: 'user',
        key: 'test-flag',
        userKey: 'test-user',
        evaluationContext: { targetingKey: 'test-user' },
        trackingEventDetails: { value: 42, metricName: 'test-metric' },
      };

      eventPublisher.addEvent(mockTrackingEvent);

      // We can't directly test the internal state, but we can verify it doesn't throw
      expect(() => eventPublisher.addEvent(mockTrackingEvent)).not.toThrow();
    });

    it('should trigger publish when max pending events reached', async () => {
      const mockEvent: FeatureEvent = {
        kind: 'feature',
        creationDate: Date.now() / 1000,
        contextKind: 'user',
        key: 'test-flag',
        userKey: 'test-user',
        default: false,
        variation: 'test-variation',
      };

      // Add events up to the max pending limit
      for (let i = 0; i < 5; i++) {
        eventPublisher.addEvent(mockEvent);
      }

      // Wait a bit for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockApi.sendEventToDataCollector).toHaveBeenCalled();
    });
  });

  describe('publishEvents', () => {
    it('should handle API errors gracefully', async () => {
      const mockError = new Error('API Error');
      mockApi.sendEventToDataCollector.mockRejectedValueOnce(mockError);

      const mockEvent: FeatureEvent = {
        kind: 'feature',
        creationDate: Date.now() / 1000,
        contextKind: 'user',
        key: 'test-flag',
        userKey: 'test-user',
        default: false,
        variation: 'test-variation',
      };

      const publisherWithLogger = new EventPublisher(mockApi, mockOptions, mockLogger);

      // Start the publisher first
      await publisherWithLogger.start();

      // Add event and stop
      publisherWithLogger.addEvent(mockEvent);
      await publisherWithLogger.stop();

      expect(mockLogger.error).toHaveBeenCalledWith('An error occurred while publishing events:', mockError);
    });

    it('should not publish when no events are available', async () => {
      await eventPublisher.stop();

      expect(mockApi.sendEventToDataCollector).not.toHaveBeenCalled();
    });
  });

  describe('buffer robustness', () => {
    /** Reads the internal buffer: the cap constrains what is *held*, not what is sent. */
    const bufferOf = (publisher: EventPublisher) => (publisher as unknown as { events: FeatureEvent[] }).events;

    const eventNamed = (key: string): FeatureEvent => ({
      kind: 'feature',
      creationDate: 1,
      contextKind: 'user',
      key,
      userKey: 'test-user',
      default: false,
      variation: 'test-variation',
    });

    const keysOfBatch = (call: number) =>
      (mockApi.sendEventToDataCollector.mock.calls[call][0] as FeatureEvent[]).map((event) => event.key);

    /** A POST that never settles, i.e. the collector-outage shape the cap and the guard exist for. */
    const hangingPost = () => new Promise<void>(() => undefined);

    /** Lets the fire-and-forget flush in `addEvent` run to its first suspension point. */
    const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

    it('should cap the buffer at twice maxPendingEvents while the collector is unreachable', async () => {
      mockApi.sendEventToDataCollector.mockImplementation(hangingPost);
      // maxPendingEvents is 5, so the cap is 10.
      const publisher = new EventPublisher(mockApi, mockOptions, mockLogger);

      for (let i = 0; i < 40; i++) {
        publisher.addEvent(eventNamed(`e${i}`));
      }
      await settle();

      // The first five drain into the hung POST; the remaining 35 pile up behind it. Uncapped, this
      // is an unbounded leak for the duration of the outage.
      expect(bufferOf(publisher)).toHaveLength(10);
    });

    it('should discard the oldest events on overflow', async () => {
      mockApi.sendEventToDataCollector.mockImplementation(hangingPost);
      const publisher = new EventPublisher(mockApi, mockOptions, mockLogger);

      for (let i = 0; i < 40; i++) {
        publisher.addEvent(eventNamed(`e${i}`));
      }
      await settle();

      expect(bufferOf(publisher).map((event) => event.key)).toEqual([
        'e30',
        'e31',
        'e32',
        'e33',
        'e34',
        'e35',
        'e36',
        'e37',
        'e38',
        'e39',
      ]);
      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('discarded'));
    });

    it('should not start a second publish while one is in flight', async () => {
      mockApi.sendEventToDataCollector.mockImplementation(hangingPost);
      const publisher = new EventPublisher(mockApi, mockOptions, mockLogger);

      for (let i = 0; i < 5; i++) {
        publisher.addEvent(eventNamed(`a${i}`));
      }
      for (let i = 0; i < 5; i++) {
        publisher.addEvent(eventNamed(`b${i}`));
      }
      await settle();

      // The second threshold crossing must not open another POST against a collector that is
      // already struggling.
      expect(mockApi.sendEventToDataCollector).toHaveBeenCalledTimes(1);
    });

    it('should re-queue a failed batch ahead of events buffered during the flight', async () => {
      let rejectFirst: (reason: Error) => void = () => undefined;
      mockApi.sendEventToDataCollector
        .mockReturnValueOnce(
          new Promise<void>((_resolve, reject) => {
            rejectFirst = reject;
          }),
        )
        .mockResolvedValue(undefined);

      const publisher = new EventPublisher(mockApi, mockOptions, mockLogger);
      await publisher.start();

      for (let i = 0; i < 5; i++) {
        publisher.addEvent(eventNamed(`old${i}`));
      }
      publisher.addEvent(eventNamed('new0'));

      rejectFirst(new Error('collector down'));
      await settle();
      await publisher.stop();

      // `push` would have filed the older batch behind `new0`, sending the collector a batch that
      // runs backwards in time.
      expect(keysOfBatch(1)).toEqual(['old0', 'old1', 'old2', 'old3', 'old4', 'new0']);
    });

    it('should still flush at shutdown when a publish is in flight', async () => {
      let resolveFirst: () => void = () => undefined;
      mockApi.sendEventToDataCollector
        .mockReturnValueOnce(
          new Promise<void>((resolve) => {
            resolveFirst = resolve;
          }),
        )
        .mockResolvedValue(undefined);

      const publisher = new EventPublisher(mockApi, mockOptions, mockLogger);
      await publisher.start();

      for (let i = 0; i < 5; i++) {
        publisher.addEvent(eventNamed(`a${i}`));
      }
      publisher.addEvent(eventNamed('late'));

      const stopped = publisher.stop();
      resolveFirst();
      await stopped;

      // Single-flight must not make the shutdown flush a no-op - `stop` joins the in-flight publish
      // before draining what is left.
      expect(mockApi.sendEventToDataCollector).toHaveBeenCalledTimes(2);
      expect(keysOfBatch(1)).toEqual(['late']);
    });
  });

  describe('default values', () => {
    it('should use default flush interval when not provided', async () => {
      const optionsWithoutFlushInterval = {
        ...mockOptions,
        dataFlushInterval: undefined,
      };

      const publisher = new EventPublisher(mockApi, optionsWithoutFlushInterval);

      jest.useFakeTimers();
      await publisher.start();

      // Add an event to trigger publishing
      const mockEvent: FeatureEvent = {
        kind: 'feature',
        creationDate: Date.now() / 1000,
        contextKind: 'user',
        key: 'test-flag',
        userKey: 'test-user',
        default: false,
        variation: 'test-variation',
      };
      publisher.addEvent(mockEvent);

      // Default should be 10000ms (from constants)
      jest.advanceTimersByTime(120010);

      expect(mockApi.sendEventToDataCollector).toHaveBeenCalled();

      jest.useRealTimers();
      await publisher.stop();
    });

    it('should use default max pending events when not provided', async () => {
      const optionsWithoutMaxPending = {
        ...mockOptions,
        maxPendingEvents: undefined,
      };

      const publisher = new EventPublisher(mockApi, optionsWithoutMaxPending);

      // Should not throw
      expect(publisher).toBeInstanceOf(EventPublisher);

      // Test that default max pending events limit is respected with mixed event types
      const mockFeatureEvent: FeatureEvent = {
        kind: 'feature',
        creationDate: Date.now() / 1000,
        contextKind: 'user',
        key: 'test-flag',
        userKey: 'test-user',
        default: false,
        variation: 'test-variation',
      };

      const mockTrackingEvent: TrackingEvent = {
        kind: 'tracking',
        creationDate: Date.now() / 1000,
        contextKind: 'user',
        key: 'test-flag',
        userKey: 'test-user',
        evaluationContext: { targetingKey: 'test-user' },
        trackingEventDetails: { metricValue: 42 },
      };

      // Add mixed events up to the default max pending limit (10000 from constants)
      // We'll add 10001 events to trigger the publish
      for (let i = 0; i < 10001; i++) {
        if (i % 2 === 0) {
          publisher.addEvent(mockFeatureEvent);
        } else {
          publisher.addEvent(mockTrackingEvent);
        }
      }

      // Wait a bit for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should trigger publish when reaching the default limit
      expect(mockApi.sendEventToDataCollector).toHaveBeenCalled();
    });
  });
});

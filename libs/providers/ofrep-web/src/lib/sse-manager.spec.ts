import { SseManager } from './sse-manager';
import type { SseManagerCallbacks } from './sse-manager';
import type { EventStream } from '@openfeature/ofrep-core';

// Mock EventSource
class MockEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: MockEventSource[] = [];

  url: string;
  readyState = 0;
  private listeners: Record<string, ((event: MessageEvent | Event) => void)[]> = {};

  constructor(url: string) {
    this.url = url;
    this.readyState = 1; // OPEN
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent | Event) => void): void {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(listener);
  }

  close(): void {
    this.readyState = 2; // CLOSED
  }

  // Test helpers
  simulateMessage(data: unknown): void {
    const event = new MessageEvent('message', { data: JSON.stringify(data) });
    for (const listener of this.listeners['message'] ?? []) {
      listener(event);
    }
  }

  simulateError(fatal = false): void {
    this.readyState = fatal ? 2 : 0; // CLOSED or CONNECTING
    const event = new Event('error');
    for (const listener of this.listeners['error'] ?? []) {
      listener(event);
    }
  }

  static reset(): void {
    MockEventSource.instances = [];
  }
}

// Install mock EventSource globally
(globalThis as Record<string, unknown>)['EventSource'] = MockEventSource;

describe('SseManager', () => {
  let callbacks: SseManagerCallbacks;
  let onRefetchMock: jest.Mock;
  let onStaleMock: jest.Mock;
  let onErrorMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    MockEventSource.reset();
    onRefetchMock = jest.fn();
    onStaleMock = jest.fn();
    onErrorMock = jest.fn();
    callbacks = { onRefetch: onRefetchMock, onStale: onStaleMock, onError: onErrorMock };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const sseStream = (url: string, inactivityDelaySec?: number): EventStream => ({
    type: 'sse',
    url,
    inactivityDelaySec,
  });

  describe('connect', () => {
    it('should connect to SSE URLs from eventStreams', () => {
      const manager = new SseManager(callbacks);
      manager.connect([sseStream('https://sse.example.com/stream')]);

      expect(manager.isConnected).toBe(true);
      expect(MockEventSource.instances).toHaveLength(1);
      expect(MockEventSource.instances[0].url).toBe('https://sse.example.com/stream');
    });

    it('should resolve URL from endpoint.origin + endpoint.requestUri', () => {
      const manager = new SseManager(callbacks);
      manager.connect([
        {
          type: 'sse',
          endpoint: { origin: 'https://sse.example.com', requestUri: '/stream?channel=abc' },
        },
      ]);

      expect(manager.isConnected).toBe(true);
      expect(MockEventSource.instances[0].url).toBe('https://sse.example.com/stream?channel=abc');
    });

    it('should ignore entries with unknown types', () => {
      const manager = new SseManager(callbacks);
      manager.connect([{ type: 'websocket', url: 'wss://example.com' }, sseStream('https://sse.example.com/stream')]);

      expect(MockEventSource.instances).toHaveLength(1);
      expect(MockEventSource.instances[0].url).toBe('https://sse.example.com/stream');
    });

    it('should not connect when there are no SSE entries', () => {
      const manager = new SseManager(callbacks);
      manager.connect([{ type: 'websocket', url: 'wss://example.com' }]);

      expect(manager.isConnected).toBe(false);
      expect(MockEventSource.instances).toHaveLength(0);
    });

    it('should connect to multiple SSE URLs', () => {
      const manager = new SseManager(callbacks);
      manager.connect([sseStream('https://sse.example.com/global'), sseStream('https://sse.example.com/user')]);

      expect(MockEventSource.instances).toHaveLength(2);
    });

    it('should close existing connections before opening new ones', () => {
      const manager = new SseManager(callbacks);
      manager.connect([sseStream('https://sse.example.com/old')]);
      const oldConnection = MockEventSource.instances[0];

      manager.connect([sseStream('https://sse.example.com/new')]);

      expect(oldConnection.readyState).toBe(2); // CLOSED
      expect(MockEventSource.instances).toHaveLength(2);
      expect(MockEventSource.instances[1].url).toBe('https://sse.example.com/new');
    });

    it('should deduplicate identical URLs', () => {
      const manager = new SseManager(callbacks);
      manager.connect([sseStream('https://sse.example.com/stream'), sseStream('https://sse.example.com/stream')]);

      expect(MockEventSource.instances).toHaveLength(1);
    });

    it('should fall back to baseUrl origin when endpoint.origin is absent', () => {
      const manager = new SseManager(callbacks, undefined, undefined, 'https://ofrep.example.com/base');
      manager.connect([
        {
          type: 'sse',
          endpoint: { requestUri: '/stream?channel=abc' },
        },
      ]);

      expect(manager.isConnected).toBe(true);
      expect(MockEventSource.instances[0].url).toBe('https://ofrep.example.com/stream?channel=abc');
    });

    it('should skip connection when endpoint has no origin and no baseUrl is provided', () => {
      const manager = new SseManager(callbacks);
      manager.connect([
        {
          type: 'sse',
          endpoint: { requestUri: '/stream' },
        },
      ]);

      expect(manager.isConnected).toBe(false);
      expect(MockEventSource.instances).toHaveLength(0);
    });
  });

  describe('refetchEvaluation events', () => {
    it('should trigger onRefetch with metadata on refetchEvaluation event', () => {
      const manager = new SseManager(callbacks);
      manager.connect([sseStream('https://sse.example.com/stream')]);

      MockEventSource.instances[0].simulateMessage({
        type: 'refetchEvaluation',
        etag: '"abc123"',
        lastModified: 1771622898,
      });

      jest.advanceTimersByTime(50); // debounce

      expect(onRefetchMock).toHaveBeenCalledTimes(1);
      expect(onRefetchMock).toHaveBeenCalledWith({
        flagConfigEtag: '"abc123"',
        flagConfigLastModified: 1771622898,
      });
    });

    it('should trigger onRefetch without metadata when fields are absent', () => {
      const manager = new SseManager(callbacks);
      manager.connect([sseStream('https://sse.example.com/stream')]);

      MockEventSource.instances[0].simulateMessage({ type: 'refetchEvaluation' });
      jest.advanceTimersByTime(50);

      expect(onRefetchMock).toHaveBeenCalledWith({});
    });

    it('should ignore unknown event types', () => {
      const manager = new SseManager(callbacks);
      manager.connect([sseStream('https://sse.example.com/stream')]);

      MockEventSource.instances[0].simulateMessage({ type: 'unknownFutureEvent' });
      jest.advanceTimersByTime(50);

      expect(onRefetchMock).not.toHaveBeenCalled();
    });

    it('should coalesce rapid events into a single refetch', () => {
      const manager = new SseManager(callbacks);
      manager.connect([sseStream('https://sse.example.com/stream')]);

      MockEventSource.instances[0].simulateMessage({
        type: 'refetchEvaluation',
        etag: '"v1"',
      });
      MockEventSource.instances[0].simulateMessage({
        type: 'refetchEvaluation',
        etag: '"v2"',
      });
      MockEventSource.instances[0].simulateMessage({
        type: 'refetchEvaluation',
        etag: '"v3"',
      });

      jest.advanceTimersByTime(50);

      // Only the last metadata should be used
      expect(onRefetchMock).toHaveBeenCalledTimes(1);
      expect(onRefetchMock).toHaveBeenCalledWith({ flagConfigEtag: '"v3"' });
    });

    it('should handle malformed SSE event data gracefully', () => {
      const manager = new SseManager(callbacks);
      manager.connect([sseStream('https://sse.example.com/stream')]);

      // Simulate a message with unparseable data
      const event = new MessageEvent('message', { data: 'not-json' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const listeners = (MockEventSource.instances[0] as any).listeners['message'];
      for (const listener of listeners) {
        listener(event);
      }

      jest.advanceTimersByTime(50);

      expect(onRefetchMock).not.toHaveBeenCalled();
    });
  });

  describe('error handling and grace period', () => {
    it('should call onStale on transient error (readyState CONNECTING)', () => {
      const manager = new SseManager(callbacks);
      manager.connect([sseStream('https://sse.example.com/stream')]);

      MockEventSource.instances[0].simulateError(false);

      expect(onStaleMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).not.toHaveBeenCalled();
    });

    it('should call onError immediately on fatal error (readyState CLOSED)', () => {
      const manager = new SseManager(callbacks);
      manager.connect([sseStream('https://sse.example.com/stream')]);

      MockEventSource.instances[0].simulateError(true);

      expect(onStaleMock).not.toHaveBeenCalled();
      expect(onErrorMock).toHaveBeenCalledTimes(1);
    });

    it('should call onError after grace period expires without recovery', () => {
      const manager = new SseManager(callbacks);
      manager.connect([sseStream('https://sse.example.com/stream')]);

      MockEventSource.instances[0].simulateError(false);
      expect(onStaleMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).not.toHaveBeenCalled();

      // Advance past 30s grace period
      jest.advanceTimersByTime(30_000);

      expect(onErrorMock).toHaveBeenCalledTimes(1);
    });

    it('should cancel grace period when a message arrives (recovery)', () => {
      const manager = new SseManager(callbacks);
      manager.connect([sseStream('https://sse.example.com/stream')]);

      MockEventSource.instances[0].simulateError(false);
      expect(onStaleMock).toHaveBeenCalledTimes(1);

      // Connection recovers — a message arrives during grace period
      MockEventSource.instances[0].simulateMessage({ type: 'refetchEvaluation', etag: '"v1"' });
      jest.advanceTimersByTime(50); // debounce

      // Grace period should be cancelled — no onError
      jest.advanceTimersByTime(30_000);
      expect(onErrorMock).not.toHaveBeenCalled();
      expect(onRefetchMock).toHaveBeenCalledTimes(1);
    });

    it('should not call onStale multiple times for repeated transient errors', () => {
      const manager = new SseManager(callbacks);
      manager.connect([sseStream('https://sse.example.com/stream')]);

      MockEventSource.instances[0].simulateError(false);
      MockEventSource.instances[0].simulateError(false);
      MockEventSource.instances[0].simulateError(false);

      expect(onStaleMock).toHaveBeenCalledTimes(1);
      expect(onErrorMock).not.toHaveBeenCalled();
    });
  });

  describe('inactivity timeout', () => {
    let mockDocument: {
      visibilityState: string;
      listeners: Record<string, (() => void)[]>;
      addEventListener: jest.Mock;
      removeEventListener: jest.Mock;
    };

    beforeEach(() => {
      mockDocument = {
        visibilityState: 'visible',
        listeners: {},
        addEventListener: jest.fn((type: string, listener: () => void) => {
          if (!mockDocument.listeners[type]) mockDocument.listeners[type] = [];
          mockDocument.listeners[type].push(listener);
        }),
        removeEventListener: jest.fn((type: string, listener: () => void) => {
          mockDocument.listeners[type] = (mockDocument.listeners[type] ?? []).filter((l) => l !== listener);
        }),
      };
      (globalThis as Record<string, unknown>)['document'] = mockDocument;
    });

    afterEach(() => {
      delete (globalThis as Record<string, unknown>)['document'];
    });

    it('should use server-provided inactivityDelaySec', () => {
      const manager = new SseManager(callbacks);
      manager.connect([sseStream('https://sse.example.com/stream', 60)]);

      expect(MockEventSource.instances).toHaveLength(1);

      // Simulate tab hidden
      mockDocument.visibilityState = 'hidden';
      for (const listener of mockDocument.listeners['visibilitychange'] ?? []) listener();

      // Advance past 60 seconds
      jest.advanceTimersByTime(60_000);

      // Connection should be closed
      expect(MockEventSource.instances[0].readyState).toBe(2);
    });

    it('should prefer client-side inactivityDelaySec override', () => {
      const manager = new SseManager(callbacks, 30);
      manager.connect([sseStream('https://sse.example.com/stream', 120)]);

      mockDocument.visibilityState = 'hidden';
      for (const listener of mockDocument.listeners['visibilitychange'] ?? []) listener();

      // Should NOT close at 29s
      jest.advanceTimersByTime(29_000);
      expect(MockEventSource.instances[0].readyState).toBe(1);

      // Should close at 30s
      jest.advanceTimersByTime(1_000);
      expect(MockEventSource.instances[0].readyState).toBe(2);
    });

    it('should default to 120 seconds when no inactivityDelaySec is set', () => {
      const manager = new SseManager(callbacks);
      manager.connect([sseStream('https://sse.example.com/stream')]);

      mockDocument.visibilityState = 'hidden';
      for (const listener of mockDocument.listeners['visibilitychange'] ?? []) listener();

      jest.advanceTimersByTime(119_000);
      expect(MockEventSource.instances[0].readyState).toBe(1);

      jest.advanceTimersByTime(1_000);
      expect(MockEventSource.instances[0].readyState).toBe(2);
    });

    it('should cancel timer when tab becomes visible before timeout', () => {
      const manager = new SseManager(callbacks, 60);
      manager.connect([sseStream('https://sse.example.com/stream')]);

      mockDocument.visibilityState = 'hidden';
      for (const listener of mockDocument.listeners['visibilitychange'] ?? []) listener();

      jest.advanceTimersByTime(30_000); // 30s into 60s timeout

      mockDocument.visibilityState = 'visible';
      for (const listener of mockDocument.listeners['visibilitychange'] ?? []) listener();

      jest.advanceTimersByTime(60_000); // Well past original timeout

      // Connection should still be open
      expect(MockEventSource.instances[0].readyState).toBe(1);
      // No refetch on resume since connection was still alive
      expect(onRefetchMock).not.toHaveBeenCalled();
    });

    it('should reconnect and do unconditional refetch when resuming after timeout', () => {
      const manager = new SseManager(callbacks, 10);
      manager.connect([sseStream('https://sse.example.com/stream')]);

      const originalConnection = MockEventSource.instances[0];

      // Tab hidden → timeout fires → connections closed
      mockDocument.visibilityState = 'hidden';
      for (const listener of mockDocument.listeners['visibilitychange'] ?? []) listener();
      jest.advanceTimersByTime(10_000);
      expect(originalConnection.readyState).toBe(2);

      // Tab visible → reconnect + unconditional refetch
      mockDocument.visibilityState = 'visible';
      for (const listener of mockDocument.listeners['visibilitychange'] ?? []) listener();

      // New connection should be created
      expect(MockEventSource.instances).toHaveLength(2);
      expect(MockEventSource.instances[1].readyState).toBe(1);

      // Unconditional refetch (no metadata)
      expect(onRefetchMock).toHaveBeenCalledWith(undefined);
    });
  });

  describe('disconnect and dispose', () => {
    it('should close all connections on disconnect', () => {
      const manager = new SseManager(callbacks);
      manager.connect([sseStream('https://sse.example.com/a'), sseStream('https://sse.example.com/b')]);

      manager.disconnect();

      expect(manager.isConnected).toBe(false);
      for (const conn of MockEventSource.instances) {
        expect(conn.readyState).toBe(2);
      }
    });

    it('should not reconnect after dispose', () => {
      const manager = new SseManager(callbacks);
      manager.dispose();

      manager.connect([sseStream('https://sse.example.com/stream')]);
      expect(manager.isConnected).toBe(false);
      expect(MockEventSource.instances).toHaveLength(0);
    });
  });
});

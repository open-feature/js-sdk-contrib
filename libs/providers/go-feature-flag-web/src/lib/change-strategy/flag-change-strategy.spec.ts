import WS from 'jest-websocket-mock';
import { EventSourceMock } from '../../spec-utils/mock';
import { TestLogger } from '../../spec-utils';
import type { ServerSentEventFlagChangeStrategyOptions, WebSocketFlagChangeStrategyOptions } from './model';
import { WebSocketFlagChangeStrategy } from './implementation/flag-change-ws-strategy';
import { ServerSentEventFlagChangeStrategy } from './implementation/flag-change-sse-strategy';
import { awaitableTimeout } from '../utils';

describe('GoFeatureFlagWebProvider => Change Strategy', () => {
  let websocketMockServer: WS;
  const endpoint = 'http://localhost:1031/';
  const websocketEndpoint = 'ws://localhost:1031/stream/v1/ws/flag/change';

  const statusChangeHandler = jest.fn();
  const flagChangeHandler = jest.fn();
  const logger = new TestLogger();

  beforeAll(() => {
    EventSourceMock.activate();
    EventSourceMock.setLogger(logger);
  });

  beforeEach(async () => {
    WS.clean();
    EventSourceMock.clean();
    jest.resetAllMocks();
    websocketMockServer = new WS(websocketEndpoint, { jsonProtocol: true });
  });

  afterEach(async () => {
    WS.clean();
    websocketMockServer.close();
    EventSourceMock.clean();
    jest.resetAllMocks();
    statusChangeHandler.mockReset();
    flagChangeHandler.mockReset();
    logger.reset();
  });

  afterAll(() => {
    EventSourceMock.deactivate();
  });

  describe('WebSocket', () => {
    const strategies = new Set<WebSocketFlagChangeStrategy>();
    function getChangeStrategy(options?: Partial<WebSocketFlagChangeStrategyOptions>) {
      const strategy = new WebSocketFlagChangeStrategy(
        Object.assign(
          {},
          {
            endpoint,
            apiKey: '',
            backoff: {
              minDelayMs: 10,
              maxDelayMs: 1000,
              multiplier: 2,
            },
            maxAttempts: 3,
          } as WebSocketFlagChangeStrategyOptions,
          options,
        ),
        logger,
      );
      strategies.add(strategy);

      return strategy;
    }

    afterEach(() => {
      strategies.forEach((e) => e.close());
      strategies.clear();
    });

    it(`should be and instance of ${WebSocketFlagChangeStrategy.name}`, () => {
      expect(getChangeStrategy()).toBeInstanceOf(WebSocketFlagChangeStrategy);
    });

    it(`should be in 'idle' state when not connected`, () => {
      const changeStrategy = getChangeStrategy();
      expect(changeStrategy.status).toBe('idle');
    });

    it(`should be in 'connecting' state after calling connect()`, () => {
      const changeStrategy = getChangeStrategy();
      changeStrategy.connect();
      expect(changeStrategy.source?.readyState).toBe(WebSocket.CONNECTING);
      expect(changeStrategy.status).toBe('connecting');
    });

    it(`should be in 'connected' state after calling connect() and WebSocket is in OPEN state`, async () => {
      const changeStrategy = getChangeStrategy({
        maxAttempts: 1,
      });
      changeStrategy.connect();
      // We wait for websocket to be connected
      await websocketMockServer.connected;
      await awaitableTimeout(20);

      expect(changeStrategy.source?.readyState).toBe(WebSocket.OPEN);
      expect(changeStrategy.status).toBe('connected');
    });

    it(`should be in 'idle' state after calling disconnect()`, async () => {
      const changeStrategy = getChangeStrategy();
      changeStrategy.connect();
      // We wait for websocket to be connected
      await websocketMockServer.connected;
      await awaitableTimeout(20);
      // Let's disconnect from the source
      changeStrategy.disconnect();
      await awaitableTimeout(20);

      expect(changeStrategy.status).toBe('idle');
    });

    it(`should be in 'closed' state after calling close()`, async () => {
      const changeStrategy = getChangeStrategy();
      changeStrategy.connect();
      // We wait for websocket to be connected
      await websocketMockServer.connected;
      await awaitableTimeout(20);
      // Let's close the change strategy (releasing used resources)
      changeStrategy.close();
      await awaitableTimeout(20);

      expect(changeStrategy.status).toBe('closed');
    });

    it(`should be in 'error' state after calling connect() when WebSocket is not OPEN`, async () => {
      const changeStrategy = getChangeStrategy({
        maxAttempts: 1,
      });
      changeStrategy.connect();
      // We wait for websocket to be connected
      await websocketMockServer.connected;
      await awaitableTimeout(20);

      expect(changeStrategy.status).toBe('connected');

      // let's close the websocket server
      websocketMockServer.close();
      await awaitableTimeout(20);

      expect(changeStrategy.status).toBe('error');
    });

    it(`should be in 'error' state after max retries are reached`, async () => {
      const changeStrategy = getChangeStrategy({
        maxAttempts: 3,
        backoff: {
          minDelayMs: 50,
          maxDelayMs: 50,
          multiplier: 1,
        },
      });
      // We close the WebSocket server
      websocketMockServer.close();
      // We start connecting with the change strategy
      changeStrategy.connect();
      // We wait for the retries to happens
      await awaitableTimeout(500);

      const reconnectionAttemptsMessages = logger.inMemoryLogger['error'].filter((m) =>
        m.startsWith('WebSocketFlagChangeStrategy: error while reconnecting, next try in'),
      );
      expect(changeStrategy.status).toBe('error');
      expect(reconnectionAttemptsMessages).toHaveLength(3);
      expect(logger.inMemoryLogger['error']).toContain(
        'WebSocketFlagChangeStrategy: cannot reconnect, max retries reached',
      );
    });
  });

  describe('Server-Sent Event', () => {
    const strategies = new Set<ServerSentEventFlagChangeStrategy>();
    function getChangeStrategy(options?: Partial<ServerSentEventFlagChangeStrategyOptions>) {
      const strategy = new ServerSentEventFlagChangeStrategy(
        Object.assign(
          {},
          {
            endpoint,
            apiKey: '',
            backoff: {
              minDelayMs: 10,
              maxDelayMs: 1000,
              multiplier: 2,
            },
            maxAttempts: 3,
          } as ServerSentEventFlagChangeStrategyOptions,
          options,
        ),
        logger,
      );
      strategies.add(strategy);

      return strategy;
    }

    afterEach(() => {
      strategies.forEach((e) => e.close());
      strategies.clear();
    });

    it(`should be and instance of ${ServerSentEventFlagChangeStrategy.name}`, () => {
      expect(getChangeStrategy()).toBeInstanceOf(ServerSentEventFlagChangeStrategy);
    });

    it(`should be in 'idle' state when not connected`, () => {
      const changeStrategy = getChangeStrategy();
      expect(changeStrategy.status).toBe('idle');
    });

    it(`should be in 'connecting' state after calling connect()`, async () => {
      const changeStrategy = getChangeStrategy();
      changeStrategy.connect();
      await awaitableTimeout(10);
      expect(changeStrategy.source?.readyState).toBe(EventSource.CONNECTING);
      expect(changeStrategy.status).toBe('connecting');
    });

    it(`should be in 'connected' state after calling connect() and EventSource is in OPEN state`, async () => {
      const changeStrategy = getChangeStrategy({
        maxAttempts: 1,
      });
      changeStrategy.connect();
      // We wait for EventSource to be connected
      EventSourceMock.ready();
      await awaitableTimeout(20);

      expect(changeStrategy.source?.readyState).toBe(EventSource.OPEN);
      expect(changeStrategy.status).toBe('connected');
    });

    it(`should be in 'idle' state after calling disconnect()`, async () => {
      const changeStrategy = getChangeStrategy();
      changeStrategy.connect();
      // We wait for EventSource to be connected
      EventSourceMock.ready();
      await awaitableTimeout(20);
      // Let's disconnect from the source
      changeStrategy.disconnect();
      await awaitableTimeout(20);

      expect(changeStrategy.status).toBe('idle');
    });

    it(`should be in 'closed' state after calling close()`, async () => {
      const changeStrategy = getChangeStrategy();
      changeStrategy.connect();
      // We wait for EventSource to be connected
      EventSourceMock.ready();
      await awaitableTimeout(20);
      // Let's close the change strategy (releasing used resources)
      changeStrategy.close();
      await awaitableTimeout(20);

      expect(changeStrategy.status).toBe('closed');
    });

    it(`should be in 'error' state after calling connect() when WebSocket is not OPEN`, async () => {
      const changeStrategy = getChangeStrategy({
        maxAttempts: 1,
      });
      changeStrategy.connect();
      // We wait for EventSource to be connected
      EventSourceMock.ready();
      await awaitableTimeout(20);

      expect(changeStrategy.status).toBe('connected');

      // let's close the EventSource
      EventSourceMock.closeAll();
      await awaitableTimeout(20);

      expect(changeStrategy.status).toBe('error');
    });

    it(`should be in 'error' state after max retries are reached`, async () => {
      const changeStrategy = getChangeStrategy({
        maxAttempts: 3,
        backoff: {
          minDelayMs: 50,
          maxDelayMs: 50,
          multiplier: 1,
        },
      });
      // We set the source unreachable
      EventSourceMock.setConnectionDelay(100);
      EventSourceMock.offline();
      // We start connecting with the change strategy
      changeStrategy.connect();
      // We wait for the retries to happens
      await awaitableTimeout(1000);

      const reconnectionAttemptsMessages = logger.inMemoryLogger['error'].filter((m) =>
        m.startsWith('ServerSentEventFlagChangeStrategy: error while reconnecting, next try in'),
      );
      expect(changeStrategy.status).toBe('error');
      expect(reconnectionAttemptsMessages).toHaveLength(3);
      expect(logger.inMemoryLogger['error']).toContain(
        'ServerSentEventFlagChangeStrategy: cannot reconnect, max retries reached',
      );
    });

    it(`should be in 'error' state when apiKey is missing and source expects it`, async () => {
      const changeStrategy = getChangeStrategy({
        apiKey: '',
        maxAttempts: 1,
        backoff: {
          multiplier: 1,
          minDelayMs: 10,
          maxDelayMs: 10,
        },
      });
      // We set the required parameter
      EventSourceMock.setQueryParam('apiKey', true);
      // We start connecting with the change strategy
      changeStrategy.connect();
      EventSourceMock.ready();
      await awaitableTimeout(100);

      expect(changeStrategy.status).toBe('error');
      expect(logger.inMemoryLogger['error']).toContain("EventSourceMock: missing required query param 'apiKey'.");
      expect(logger.inMemoryLogger['error']).toContain(
        'ServerSentEventFlagChangeStrategy: cannot reconnect, max retries reached',
      );
    });

    it(`should be in 'connected' state when apiKey is set and source expects it`, async () => {
      const changeStrategy = getChangeStrategy({
        apiKey: 'api-key',
        maxAttempts: 1,
        backoff: {
          multiplier: 1,
          minDelayMs: 10,
          maxDelayMs: 10,
        },
      });
      // We set the required parameter
      EventSourceMock.setQueryParam('apiKey', true);
      // We start connecting with the change strategy
      changeStrategy.connect();
      EventSourceMock.ready();
      await awaitableTimeout(100);

      expect(changeStrategy.status).toBe('connected');
      expect(logger.inMemoryLogger['error']).not.toContain("EventSourceMock: missing required query param 'apiKey'.");
      expect(logger.inMemoryLogger['debug']).toContain(
        "EventSourceMock: found required query param 'apiKey' with value 'api-key'.",
      );
      expect(logger.inMemoryLogger['error']).not.toContain(
        'ServerSentEventFlagChangeStrategy: cannot reconnect, max retries reached',
      );
    });

    it(`should use the new apiKey when key rotation happens`, async () => {
      const currentKey = 'api-key';
      const newKey = 'new-key';

      const changeStrategy = getChangeStrategy({
        apiKey: currentKey,
        maxAttempts: 1,
        backoff: {
          multiplier: 1,
          minDelayMs: 10,
          maxDelayMs: 10,
        },
      });
      // We set the required parameter
      EventSourceMock.setQueryParam('apiKey', true);
      // We start connecting with the change strategy
      changeStrategy.connect();
      EventSourceMock.ready();
      await awaitableTimeout(100);
      // We rotate the key
      changeStrategy.setApiKey(newKey);
      await awaitableTimeout(100);

      console.log(logger.timeline().join('\n'));
      expect(changeStrategy.status).toBe('connected');
      expect(logger.inMemoryLogger['debug']).toContain(
        `${EventSourceMock.name}: found required query param 'apiKey' with value '${newKey}'.`,
      );
    });
  });
});

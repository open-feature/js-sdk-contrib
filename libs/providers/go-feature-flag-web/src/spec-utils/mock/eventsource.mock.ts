import type { Logger } from '@openfeature/core';
import { awaitableTimeout, DeferredPromise } from '../../lib/utils';

export class EventSourceMock implements EventSource {
  readonly CLOSED: 2;
  readonly CONNECTING: 0;
  readonly OPEN: 1;

  onopen: ((this: EventSource, ev: Event) => any) | null;
  onmessage: ((this: EventSource, ev: MessageEvent) => any) | null;
  onerror: ((this: EventSource, ev: Event) => any) | null;

  public readyState: number;
  readonly url: string;
  readonly withCredentials: boolean;

  /**
   * (internal) the {@link URL} used by the {@link EventSource} instance.
   */
  private readonly _url: URL;

  /**
   * (internal) used to track the mocked EventSource instances.
   */
  protected eventListenersMap: Map<string, Set<(...args: any[]) => void>>;

  /**
   * (internal) indicates if mock is enabled or not.
   */
  private static _mockEnabled = false;
  /**
   * (internal) the {@link EventSource} implementation that has been mocked.
   * It will be restored once `deactivate()` is called.
   */
  private static _originalEventSourceDef?: any;
  /**
   * (internal) the set of tracked {@link EventSource} instances.
   */
  private static _instances: Set<EventSourceMock> = new Set();
  /**
   * (internal) used to track required query params that a source SSE endpoint would require.
   */
  private static _requiredQueryParams: Set<string> = new Set();
  /**
   * (internal) status of the mocked source.
   */
  private static _serverStatus: 'offline' | 'online' = 'online';
  /**
   * (internal) delay of time (in milliseconds) to use when connecting a new {@link EventSource} instance.
   */
  private static _serverConnectionDelay?: number;
  /**
   * (internal) indicates when the mocked server is ready to accept connections form instances.
   */
  private static _serverReady: DeferredPromise = new DeferredPromise();
  /**
   * (internal) logger used during tests
   */
  private static _logger?: Logger;

  constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
    this.CONNECTING = 0;
    this.OPEN = 1;
    this.CLOSED = 2;

    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;

    this._url = new URL(url);
    this.url = `${url}`;
    this.withCredentials = (eventSourceInitDict && eventSourceInitDict.withCredentials) || false;
    this.readyState = this.CONNECTING;

    this.eventListenersMap = new Map();
    EventSourceMock.addInstance(this);
    EventSourceMock.resolveInstanceState(this).catch(() => this.close());
  }

  private static async resolveInstanceState(e: EventSourceMock): Promise<void> {
    // First wait on the server readiness
    await this._serverReady.promise;
    // Eventually wait for some delay
    await awaitableTimeout(this._serverConnectionDelay);

    switch (this._serverStatus) {
      case 'online':
        if (this.validateQueryParams(e)) return e.connect();
        else return e.close();
      case 'offline':
        e.fail();
        // we try to reconnect
        return EventSourceMock.resolveInstanceState(e);
      default:
        return e.close();
    }
  }

  close(): void {
    if (this.readyState === this.CLOSED) return;
    EventSourceMock.removeInstance(this);
    this.readyState = this.CLOSED;
    this.dispatchEvent(new Event('error'));
  }

  private connect() {
    this.readyState = this.OPEN;
    this.dispatchEvent(new Event('open'));
  }

  private fail() {
    this.readyState = this.CONNECTING;
    this.dispatchEvent(new Event('error'));
  }

  private send(...messages: any[]) {
    for (const m of messages) {
      const jsonData = typeof m === 'string' ? m : JSON.stringify(m);
      this.dispatchEvent(new MessageEvent('message', { data: jsonData }));
    }
  }

  dispatchEvent(event: Event): boolean {
    const listeners = this.eventListenersMap.get(event.type);

    if (listeners) {
      for (const listener of listeners) {
        listener(event);
      }
    }

    switch (event.type) {
      case 'message':
        if (typeof this.onmessage === 'function') {
          this.onmessage(event as MessageEvent);
        }
        break;
      case 'error':
        if (typeof this.onerror === 'function') {
          this.onerror(event);
        }
        break;
      case 'open':
        if (typeof this.onopen === 'function') {
          this.onopen(event);
        }
        break;
    }

    return true;
  }

  addEventListener(
    type: string,
    listener: (...args: any[]) => void,
    options?: boolean | AddEventListenerOptions,
  ): void {
    let set = this.eventListenersMap.get(type);

    if (!set) {
      set = new Set();
      this.eventListenersMap.set(type, set);
    }

    set.add(listener);
  }

  removeEventListener(
    type: string,
    listener: (...args: any[]) => void,
    options?: boolean | EventListenerOptions,
  ): void {
    this.eventListenersMap.get(type)?.delete(listener);
  }

  /**
   * (internal) used to add an {@link EventSource} instance to the tracked instances.
   * @param e
   */
  private static addInstance(e: EventSourceMock) {
    this._instances.add(e);
  }

  /**
   * (internal) used to remove an {@link EventSource} instance to the tracked instances.
   * @param e
   */
  private static removeInstance(e: EventSourceMock) {
    this._instances.delete(e);
  }

  private static validateQueryParams(e: EventSourceMock) {
    return this._requiredQueryParams.keys().every((p) => {
      if (e._url.searchParams.has(p)) {
        this._logger?.debug(
          `${EventSourceMock.name}: found required query param '${p}' with value '${e._url.searchParams.get(p)}'.`,
        );
        return true;
      }
      // required query param is missing
      this._logger?.error(`${EventSourceMock.name}: missing required query param '${p}'.`);
      return false;
    });
  }

  /**
   * Activates the mock.
   * @returns
   */
  public static activate() {
    if (this._mockEnabled) return;
    this._originalEventSourceDef = globalThis.EventSource;
    globalThis.EventSource = EventSourceMock as any as typeof globalThis.EventSource;
    this._mockEnabled = true;
  }

  /**
   * Deactivates the mock.
   * @returns
   */
  public static deactivate() {
    if (!this._mockEnabled) return;
    globalThis.EventSource = this._originalEventSourceDef;
    this.clean();
    this._mockEnabled = false;
  }

  /**
   * Will put the EventSource source in ready state.
   */
  public static ready() {
    this._serverReady.resolve();
  }

  /**
   * Will put all the tracked {@link EventSource} instances in the CONNECTING state
   * and it will dispatch an `error` event to all of them.
   */
  public static failAll() {
    this._instances.forEach((e) => e.fail());
  }

  /**
   * Will call `close()` on all the tracked {@link EventSource} instances.
   */
  public static closeAll() {
    this._instances.forEach((e) => e.close());
  }

  /**
   * Will clean the current mock state
   */
  public static clean() {
    this.closeAll();
    this._instances.clear();
    this._requiredQueryParams.clear();
    this._serverReady = new DeferredPromise();
    this._serverStatus = 'online';
    this._serverConnectionDelay = undefined;
  }

  /**
   * This method will dispatch a `message` event on all the tracked {@link EventSource} instances.
   * @param messages
   * @returns
   */
  public static send(...messages: any[]) {
    if (!messages.length || !this._instances.size) return;
    for (const e of this._instances) {
      e.send(...messages);
    }
  }

  /**
   * Used to set/unset required query params on the URL of {@link EventSource} instances
   * @param param
   * @param required
   */
  public static setQueryParam(param: string, required?: boolean) {
    if (required) this._requiredQueryParams.add(param);
    else this._requiredQueryParams.delete(param);
  }
  /**
   * Put the mocked EventSource source in offline mode
   */
  public static offline() {
    this._serverStatus = 'offline';
    this.ready();
  }
  /**
   * Put the mocked EventSource source in online mode
   */
  public static online() {
    this._serverStatus = 'online';
    this.ready();
  }

  /**
   * Used to set a delay between CONNECTING and OPEN state of an {@link EventSource} instance
   * @param delay
   */
  public static setConnectionDelay(delay?: number) {
    this._serverConnectionDelay = delay;
  }

  public static setLogger(logger?: Logger) {
    this._logger = logger;
  }
}

// it looks like the following is needed, otherwise is not possible to use `EventSource.CONNECTING` when the mock is active.
// NOTE: maybe we can find something better.
(EventSourceMock as any).CONNECTING = 0;
(EventSourceMock as any).OPEN = 1;
(EventSourceMock as any).CLOSED = 2;

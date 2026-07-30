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
   * (internal) used to track the mocked EventSource instances
   */
  protected eventListenersMap: Map<string, Set<(...args: any[]) => void>>;

  /**
   * (internal) indicates if mock is enabled or not
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

  constructor(url: string | URL, eventSourceInitDict?: EventSourceInit) {
    this.CONNECTING = 0;
    this.OPEN = 1;
    this.CLOSED = 2;

    this.onopen = null;
    this.onmessage = null;
    this.onerror = null;

    this.url = url.toString();
    this.withCredentials = (eventSourceInitDict && eventSourceInitDict.withCredentials) || false;
    this.readyState = this.CONNECTING;

    this.eventListenersMap = new Map();
    EventSourceMock.addInstance(this);
  }

  close(): void {
    if (this.readyState === this.CLOSED) return;
    this.readyState = this.CLOSED;
    this.dispatchEvent(new Event('error'));
    EventSourceMock.removeInstance(this);
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
    this.closeAll();
    this._mockEnabled = false;
  }

  /**
   * Will put all the tracked {@link EventSource} instances in the OPEN state
   * and it will dispatch an `open` event to all of them.
   */
  public static connectInstances() {
    for (const e of this._instances) {
      e.readyState = e.OPEN;
      e.dispatchEvent(new Event('open'));
    }
  }

  /**
   * Will put all the tracked {@link EventSource} instances in the CONNECTING state
   * and it will dispatch an `error` event to all of them.
   */
  public static failAll() {
    for (const e of this._instances) {
      e.readyState = e.CONNECTING;
      e.dispatchEvent(new Event('error'));
    }
  }

  /**
   * Will call `close()` on all the tracked {@link EventSource} instances.
   */
  public static closeAll() {
    for (const e of this._instances) {
      e.close();
    }
  }

  /**
   * Will clean the current mock state
   */
  public static clean() {
    this.closeAll();
  }

  /**
   * This method will dispatch a `message` event on all the tracked {@link EventSource} instances.
   * @param messages
   * @returns
   */
  public static send(...messages: any[]) {
    if (!messages.length || !this._instances.size) return;
    for (const m of messages) {
      const jsonData = JSON.stringify(m);
      for (const p of this._instances) {
        p.dispatchEvent(new MessageEvent('message', { data: jsonData }));
      }
    }
  }
}

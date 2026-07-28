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

  protected eventListenersMap: Map<string, Set<(...args: any[]) => void>>;

  private static _mockEnabled = false;
  private static _originalEventSourceDef?: any;
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

  private static addInstance(e: EventSourceMock) {
    this._instances.add(e);
  }

  private static removeInstance(e: EventSourceMock) {
    this._instances.delete(e);
  }

  public static activate() {
    if (this._mockEnabled) return;
    this._originalEventSourceDef = globalThis.EventSource;
    globalThis.EventSource = EventSourceMock as any as typeof globalThis.EventSource;
    this._mockEnabled = true;
  }

  public static deactivate() {
    if (!this._mockEnabled) return;
    globalThis.EventSource = this._originalEventSourceDef;
    this.closeAll();
    this._mockEnabled = false;
  }

  public static connectInstances() {
    for (const e of this._instances) {
      e.readyState = e.OPEN;
      e.dispatchEvent(new Event('open'));
    }
  }

  public static failAll() {
    for (const e of this._instances) {
      e.readyState = e.CONNECTING;
      e.dispatchEvent(new Event('error'));
    }
  }

  public static closeAll() {
    for (const e of this._instances) {
      e.close();
    }
  }

  public static clean() {
    this.closeAll();
  }

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

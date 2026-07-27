export interface PromiseOptions {
  signal?: AbortSignal;
}

export function getAbortError(reason?: string) {
  return new DOMException(reason || 'The operation was aborted', 'AbortError');
}

export function isAbortError(err: any): boolean {
  return err && err.name === 'AbortError';
}

export class DeferredPromise<T = void> {
  private readonly _options: PromiseOptions;
  private readonly _promise: Promise<T>;
  private _resolve!: (value: T | PromiseLike<T>) => void;
  private _reject!: (reason?: any) => void;
  // indicate if the promise has been fulfilled or not
  private _fulfilled = false;
  private _signalAbortHandler = (() => {
    this.reject(getAbortError());
  }).bind(this);

  get promise() {
    return this._promise;
  }
  get fulfilled() {
    return this._fulfilled;
  }
  get signal() {
    return this._options?.signal;
  }

  constructor(options?: PromiseOptions) {
    this._options = Object.assign({}, options);
    this._promise = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
    this._options.signal?.addEventListener('abort', this._signalAbortHandler, { once: true });
  }

  public resolve(value: T | PromiseLike<T>) {
    if (!this._fulfilled) {
      this._fulfilled = true;
      this._options?.signal?.removeEventListener('abort', this._signalAbortHandler);
      this._resolve(value);
    }
  }

  public reject(reason?: any) {
    if (!this._fulfilled) {
      this._fulfilled = true;
      this._options?.signal?.removeEventListener('abort', this._signalAbortHandler);
      this._reject(reason);
    }
  }
}

export async function awaitableTimeout(milliseconds?: number, options?: PromiseOptions) {
  if (options?.signal?.aborted) return Promise.reject(getAbortError());
  let timeout: any = undefined;
  const deferred = new DeferredPromise(options);
  timeout = setTimeout(() => {
    deferred.resolve();
  }, milliseconds);

  await deferred.promise.catch((err) => {
    clearTimeout(timeout);
    throw err;
  });
}

export function whenAnySettle(promises: Promise<any>[]) {
  return Promise.race(
    promises.map((p) =>
      p
        .then((data) => ({ promise: p, data, error: undefined }))
        .catch((err) => ({ promise: p, data: undefined, error: err })),
    ),
  );
}

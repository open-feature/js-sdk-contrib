/**
 * Used to configure a {@link DeferredPromise} instance
 */
export interface PromiseOptions {
  /**
   * The {@link AbortSignal} that can be used to reject the related `promise` with an error of type `AbortError`
   */
  signal?: AbortSignal;
}

/**
 * Create an instance of {@link Error} with name `AbortError`
 * @param reason
 * @returns
 */
export function getAbortError(reason?: string) {
  return new DOMException(reason || 'The operation was aborted', 'AbortError');
}

/**
 * An helper function that check if the provided error is an `AbortError`
 * @param err
 * @returns
 */
export function isAbortError(err: any): boolean {
  return err && err.name === 'AbortError';
}

/**
 * This class can be used to `resolve()` or `reject()` a {@link Promise} in a deferred way.
 * Useful when the fulfilled value must be provided from callbacks.
 */
export class DeferredPromise<T = void> {
  private readonly _options: PromiseOptions;
  private readonly _promise: Promise<T>;
  private _resolve!: (value: T | PromiseLike<T>) => void;
  private _reject!: (reason?: any) => void;
  // indicate if the promise has been fulfilled or not
  private _fulfilled = false;
  private readonly _signalAbortHandler = () => {
    this.reject(getAbortError());
  };

  /**
   * The {@link Promise} linked to the deferred instance.
   */
  get promise() {
    return this._promise;
  }
  /**
   * Indicates if the related `promise` property is fulfilled or not.
   */
  get fulfilled() {
    return this._fulfilled;
  }
  /**
   * The {@link AbortSignal} associated to this deferred instance, if any was provided.
   */
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

  /**
   * Resolves the related `promise` with the provided value.
   * @param value
   */
  public resolve(value: T | PromiseLike<T>) {
    if (!this._fulfilled) {
      this._fulfilled = true;
      this._options?.signal?.removeEventListener('abort', this._signalAbortHandler);
      this._resolve(value);
    }
  }

  /**
   * Rejects the related `promise` with the provided reason.
   * @param reason
   */
  public reject(reason?: any) {
    if (!this._fulfilled) {
      this._fulfilled = true;
      this._options?.signal?.removeEventListener('abort', this._signalAbortHandler);
      this._reject(reason);
    }
  }
}

/**
 * Helper function that can be used to get a {@link Promise}-like awaitable timeout,
 * as a wrapper around {@link setTimeout()} function.
 * @param milliseconds
 * @param options
 * @returns
 */
export async function awaitableTimeout(milliseconds?: number, options?: PromiseOptions): Promise<void> {
  if (options?.signal?.aborted) throw getAbortError();
  if (!milliseconds || milliseconds <= 0) return;
  // Let's set-up the timeout resources
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

/**
 * Helper function returning an object containing:
 * - a `promise` field of type {@link Promise} referencing the first resolved/rejected Promise given as input.
 * - a `data` field containing the eventual resolved value from `promise`
 * - an `error` field containing the eventual value rejected from `promise`
 * @param promises
 * @returns
 */
export function whenAnySettle(promises: Promise<any>[]) {
  return Promise.race(
    promises.map((p) =>
      p
        .then((data) => ({ promise: p, data, error: undefined }))
        .catch((err) => ({ promise: p, data: undefined, error: err })),
    ),
  );
}

/**
 * Helper function to create a composite {@link AbortSignal} that will abort
 * when any of the provided {@link AbortSignal}s are aborted.
 * @param signals
 * @returns
 */
export function compositeAbortSignal(signals: AbortSignal[]): AbortSignal {
  return compositeAbortController(signals).signal;
}

/**
 * Helper function to create an {@link AbortController} that will abort when calling `abort()`
 * or when any of the provided {@link AbortSignal}s are aborted.
 * @param signals
 * @returns
 */
export function compositeAbortController(signals: AbortSignal[]): AbortController {
  const abortController = new AbortController();
  const attachedSignals = new Map<AbortSignal, any>();
  const composite = {
    abort(reason?: any) {
      for (const [signal, handler] of attachedSignals) {
        signal.removeEventListener('abort', handler);
      }
      attachedSignals.clear();
      abortController.abort(reason);
    },
    signal: abortController.signal,
  } as AbortController;

  const attachSignal = (signal: AbortSignal, idx: number) => {
    if (attachedSignals.has(signal)) return;
    const handler = () =>
      composite.abort(`The source signal at position ${idx} has been aborted with reason: ${signal.reason}`);
    signal.addEventListener('abort', handler, { once: true });
    attachedSignals.set(signal, handler);
  };

  for (let i = 0; i < signals.length; i++) {
    if (signals[i].aborted) {
      composite.abort(`The source signal at position ${i} was already aborted`);
      break;
    }
    attachSignal(signals[i], i);
  }

  return composite;
}

/**
 * FetchError is a wrapper around the HTTP error returned by
 * the method fetch.
 * It allows to throw an error with the status code.
 */
export class FetchError extends Error {
  status: number;
  retriable: boolean;
  retryAfterMs?: number;
  constructor(status: number, retriable = false, retryAfterMs?: number) {
    super(`Request failed with status code ${status}`);
    this.status = status;
    this.retriable = retriable;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * FetchAbortedError is a wrapper around the cancellation of a fetch() request
 */
export class FetchAbortedError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`Request cancelled with reason: ${reason}`);
    this.reason = reason;
  }
}

/**
 * FetchTimeoutError is a wrapper around the timeoout of a fetch() request
 */
export class FetchTimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
    this.timeoutMs = timeoutMs;
  }
}

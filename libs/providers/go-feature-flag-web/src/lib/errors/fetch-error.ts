/**
 * FetchError is a wrapper around the HTTP error returned by
 * the method fetch.
 * It allows to throw an error with the status code.
 */
export class FetchError extends Error {
  status: number;
  constructor(status: number) {
    super(`Request failed with status code ${status}`);
    this.status = status;
  }
}

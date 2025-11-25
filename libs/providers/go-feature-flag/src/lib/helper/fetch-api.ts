/**
 * FetchAPI is the type of the fetch function.
 */
export type FetchAPI = WindowOrWorkerGlobalScope['fetch'];

export const isomorphicFetch = (): FetchAPI => {
  // We need to do this, as fetch needs the window as scope in the browser: https://fetch.spec.whatwg.org/#concept-request-window
  // Without this any request will fail in the browser https://stackoverflow.com/questions/69876859/why-does-bind-fix-failed-to-execute-fetch-on-window-illegal-invocation-err
  if (globalThis) {
    return globalThis.fetch.bind(globalThis);
  } else if (window) {
    return window.fetch.bind(window);
  } else if (self) {
    return self.fetch.bind(self);
  }
  return fetch;
};

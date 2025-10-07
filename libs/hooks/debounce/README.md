# Debounce Hook

This is a utility "meta" hook, which can be used to effectively debounce or rate limit other hooks based on various parameters.
This can be especially useful for certain UI frameworks and SDKs that frequently re-render and re-evaluate flags (React, Angular, etc).

## Installation

```
$ npm install @openfeature/debounce-hook
```

### Peer dependencies

Confirm that the following peer dependencies are installed:

```
$ npm install @openfeature/web-sdk
```

NOTE: if you're using the React or Angular SDKs, you don't need to directly install this web SDK.

## Usage

The hook maintains a simple expiring cache with a fixed max size and keeps a record of recent evaluations based on a user-defined key-generation function (keySupplier).
Simply wrap your hook with the debounce hook by passing it a constructor arg, and then configure the remaining options.
In the example below, we wrap a logging hook so that it only logs a maximum of once a minute for each flag key, no matter how many times that flag is evaluated.

```ts
// a function defining the key for the hook stage 
const supplier = (flagKey: string, context: EvaluationContext, details: EvaluationDetails<T>) => flagKey;

const hook = new DebounceHook<string>(loggingHook, {
  afterCacheKeySupplier: supplier,  // if the key calculated by the supplier exists in the cache, the wrapped hook's stage will not run
  ttlMs: 60_000,                    // how long to cache keys for
  maxCacheItems: 100,               // max amount of items to keep in the LRU cache
  cacheErrors: false                // whether or not to cache the errors thrown by hook stages
});
```

## Development

### Building

Run `nx package hooks-debounce` to build the library.

### Running unit tests

Run `nx test hooks-debounce` to execute the unit tests via [Jest](https://jestjs.io).

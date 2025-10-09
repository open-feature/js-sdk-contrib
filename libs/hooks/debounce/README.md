# Debounce Hook

This is a utility "meta" hook, which can be used to effectively debounce or rate limit other hooks based on various parameters.
This can be especially useful for certain UI frameworks and SDKs that frequently re-render and re-evaluate flags (React, Angular, etc).

## Installation

```
$ npm install @openfeature/debounce-hook
```

### Peer dependencies

This package only requires the `@openfeature/core` dependency, which is installed automatically no matter which OpenFeature JavaScript SDK you are using.

## Usage

Simply wrap your hook with the debounce hook by passing it as a constructor arg, and then configure the remaining options.
In the example below, we wrap a logging hook.
This debounces all its stages, so it only logs a maximum of once a minute for each flag key, no matter how many times that flag is evaluated.

```ts
const debounceHook = new DebounceHook<string>(loggingHook, {
  debounceTime: 60_000,             // how long to wait before the hook can fire again
  maxCacheItems: 100,               // max amount of items to keep in the cache; if exceeded, the oldest item is dropped
});

// add the hook globally
OpenFeature.addHooks(debounceHook);

// or at a specific client
client.addHooks(debounceHook);
```

The hook maintains a simple expiring cache with a fixed max size and keeps a record of recent evaluations based on an optional key-generation function (keySupplier).
Be default, the key-generation function is purely based on the flag key.
Particularly in server use-cases, you may want to take the targetingKey or other contextual information into account in your debouncing:

```ts
const debounceHook = new DebounceHook<string>(loggingHook, {
  cacheKeySupplier: (flagKey, context) => flagKey + context.targetingKey, // cache on a combination of user and flag key
  debounceTime: 60_000,            
  maxCacheItems: 1000,              
});
```

## Development

### Building

Run `nx package hooks-debounce` to build the library.

### Running unit tests

Run `nx test hooks-debounce` to execute the unit tests via [Jest](https://jestjs.io).

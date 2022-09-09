# flagd-web Provider for OpenFeature

![Experimental](https://img.shields.io/badge/experimental-breaking%20changes%20allowed-yellow)

A feature flag daemon with a Unix philosophy.

## Installation

:warning: This provider requires an experimental version of the JS-SDK:

```
npm i @openfeature/js-sdk@1.0.99-experimental-55bf085fbdec8a76753b02b3efee8bec3eac53c0
```

```sh
npm install @openfeature/flagd-web-provider
```

## Usage

The `FlagdWebProvider` communicates with flagd via the [connect protocol](https://buf.build/blog/connect-a-better-grpc).

### Reconnection

If the connection to the flagd instance fails, the provider will attempt to reconnect with an exponential back-off. The `maxDelay` and `maxRetries` can be specified to customize reconnect behavior.

### Event streaming

The `FlagdWebProvider` can be configured to receive events for flag changes. Combined with the event API in the JS SDK, this allows for subscription to flag value changes in clients.

### Caching

The `FlagdWebProvider` will cache resolve flag values based on the associated flag-key and context. Values are cached in localstorage. A TTL for cached values can be specified. If [event-streaming](#event-streaming) is enabled, the cache will be invalidated intelligently when flag configuration change events are received.

### Available options

| Option name    | Type    | Default   | Description                                                                                                        |
| -------------- | ------- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| host           | string  | localhost | sets the host used to connect to the flagd instance                                                                |
| port           | number  | 8013      | sets the port used to connect to the flagd instance                                                                |
| tls            | boolean | false     | when set to true the provider will attempt to connect to flagd via https                                           |
| maxRetries     | number  | 0         | sets the maximum number of retries for a connection to be made to the flagd instance, a value of 0 means unlimited |
| maxDelay       | number  | 60000     | sets the maximum time in ms to wait between reconnect intervals                                                    |
| caching        | boolean | true      | when set to true the provider will use client side caching                                                         |
| cacheTtl       | number  | 300         | sets the timeout in ms for items in the cache, a value of 0 disables the ttl                                       |
| eventStreaming | boolean | true      | enables or disables streaming and event features.                                                                  |

## Example

```typescript
OpenFeature.setProvider(
  new FlagdWebProvider({
    host: 'localhost',
    port: 8013,
    tls: true,
    maxRetries: 10,
    maxDelay: 30000,
    cache: true,
    cacheTTL: 60000,
  })
);
```

## Building

Run `npx nx package providers-flagd-web` to build the library.

> NOTE: [Buf](https://docs.buf.build/installation) must be installed to build locally.

## Running unit tests

Run `npx nx test providers-flagd-web` to execute the unit tests via [Jest](https://jestjs.io).

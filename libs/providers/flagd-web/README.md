# flagd-web Provider for OpenFeature

![Experimental](https://img.shields.io/badge/experimental-breaking%20changes%20allowed-yellow)

A feature flag daemon with a Unix philosophy.

## Installation

:warning: This provider requires the use of the experimental @openfeature/web-sdk:

```
npm install @openfeature/web-sdk
```

```sh
npm install @openfeature/flagd-web-provider
```

## Usage

The `FlagdWebProvider` communicates with flagd via the [connect protocol](https://buf.build/blog/connect-a-better-grpc).

### Available options

| Option name | Type    | Default   | Description                                                                                                                                            |
| ----------- | ------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| host        | string  | localhost | sets the host used to connect to the flagd instance                                                                                                    |
| port        | number  | 8013      | sets the port used to connect to the flagd instance                                                                                                    |
| tls         | boolean | false     | when set to true the provider will attempt to connect to flagd via https                                                                               |
| maxRetries  | number  | 0         | sets the maximum number of retries for a connection to be made to the flagd instance, a value of 0 means unlimited. A negative value means no retries. |
| maxDelay    | number  | 60000     | sets the maximum time in ms to wait between reconnect intervals                                                                                        |

### Reconnection

If the connection to the flagd instance fails, the provider will attempt to reconnect with an exponential back-off. The `maxDelay` and `maxRetries` can be specified to customize reconnect behavior.

### Event streaming

The `FlagdWebProvider` receives events from flag with changes. Combined with the event API in the web SDK, this allows for subscription to flag value changes in clients.

```typescript
client.addHandler(ProviderEvents.Ready, () => {
  // do something when the configuration has changed.
});
```

### Caching

The `FlagdWebProvider` evaluates flags in bulk, taking into account the evaluation context, and then caches them for local evaluation. The cache is invalidated when flag configuration change events are received.

## Example

```typescript
OpenFeature.setProvider(
  new FlagdWebProvider({
    host: 'myapp.com',
    port: 443,
    tls: true,
    maxRetries: 10,
    maxDelay: 30000,
  })
);
```

## Building

Run `npx nx package flagd-web` to build the library.

> NOTE: [Buf](https://docs.buf.build/installation) must be installed to build locally.

## Running unit tests

Run `npx nx test flagd-web` to execute the unit tests via [Jest](https://jestjs.io).

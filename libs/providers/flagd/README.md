# Server-Side flagd Provider

Flagd is a simple daemon for evaluating feature flags.
It is designed to conform to OpenFeature schema for flag definitions.
This repository and package provides the client code for interacting with it via the OpenFeature server-side JavaScript SDK.

## Installation

```
$ npm install @openfeature/flagd-provider
```

Required peer dependencies

```
$ npm install @openfeature/server-sdk @grpc/grpc-js @openfeature/flagd-core
```

## Usage

The `FlagdProvider` supports multiple configuration options and has the ability to resolve flags remotely or in-process.
Options can be defined in the constructor or as environment variables, with constructor options having the highest precedence.

### Available Options

| Option name           | Environment variable name      | Type    | Default   | Values          |
|-----------------------|--------------------------------|---------|-----------|-----------------|
| host                  | FLAGD_HOST                     | string  | localhost |                 |
| port                  | FLAGD_PORT                     | number  | 8013      |                 |
| tls                   | FLAGD_TLS                      | boolean | false     |                 |
| socketPath            | FLAGD_SOCKET_PATH              | string  | -         |                 |
| resolverType          | FLAGD_SOURCE_RESOLVER          | string  | rpc       | rpc, in-process |
| selector              | FLAGD_SOURCE_SELECTOR          | string  | -         |                 |
| cache                 | FLAGD_CACHE                    | string  | lru       | lru,disabled    |
| maxCacheSize          | FLAGD_MAX_CACHE_SIZE           | int     | 1000      |                 |
| maxEventStreamRetries | FLAGD_MAX_EVENT_STREAM_RETRIES | int     | 5         |                 |

### Remote flag resolving using TCP

```
  OpenFeature.setProvider(new FlagdProvider({
      host: 'localhost',
      port: 8013,
  }))
```

### Remote flag resolving using Unix Socket

```
  OpenFeature.setProvider(new FlagdProvider({
      socketPath: "/tmp/flagd.socks",
  }))
```

### In-process resolver with gRPC sync connectivity

```
  OpenFeature.setProvider(new FlagdProvider({
      host: 'localhost',
      port: 8013,
      resolverType: 'in-process',
  }))
```

### Supported Events

The flagd provider emits `PROVIDER_READY`, `PROVIDER_ERROR` and `PROVIDER_CONFIGURATION_CHANGED` events.

| SDK event                        | Originating action in flagd                                                     |
|----------------------------------|---------------------------------------------------------------------------------|
| `PROVIDER_READY`                 | The streaming connection with flagd has been established.                       |
| `PROVIDER_ERROR`                 | The streaming connection with flagd has been broken.                            |
| `PROVIDER_CONFIGURATION_CHANGED` | A flag configuration (default value, targeting rule, etc) in flagd has changed. |

For general information on events, see the [official documentation](https://openfeature.dev/docs/reference/concepts/events).

### Flag Metadata

| Field   | Type   | Value                                             |
|---------|--------|---------------------------------------------------|
| `scope` | string | "selector" set for the associated source in flagd |

## Building

Run `nx package providers-flagd` to build the library.

> NOTE: [Buf](https://docs.buf.build/installation) must be installed to build locally.

## Running Unit Tests

Run `nx test providers-flagd` to execute the unit tests via [Jest](https://jestjs.io).

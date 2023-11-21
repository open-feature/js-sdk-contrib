# Server-Side flagd Provider

Flagd is a simple daemon for evaluating feature flags.
It is designed to conform to OpenFeature schema for flag definitions.
This repository and package provides the client code for interacting with it via the OpenFeature server-side JavaScript SDK.

## Installation

### npm

```sh
npm install @openfeature/flagd-provider
```

### yarn

```sh
yarn add @openfeature/server-sdk @grpc/grpc-js @openfeature/flagd-core
```

> [!NOTE]
> yarn requires manual installation of peer dependencies

## Configurations and Usage

The `FlagdProvider` supports multiple configuration options and has the ability to resolve flags remotely over RPC or in-process.
Options can be defined in the constructor or as environment variables. Constructor options having the highest precedence.

### Available Configuration Options

| Option name                            | Environment variable name      | Type    | Default   | Supported values |
| -------------------------------------- | ------------------------------ | ------- | --------- | ---------------- |
| host                                   | FLAGD_HOST                     | string  | localhost |                  |
| port                                   | FLAGD_PORT                     | number  | 8013      |                  |
| tls                                    | FLAGD_TLS                      | boolean | false     |                  |
| socketPath                             | FLAGD_SOCKET_PATH              | string  | -         |                  |
| resolverType                           | FLAGD_SOURCE_RESOLVER          | string  | rpc       | rpc, in-process  |
| selector                               | FLAGD_SOURCE_SELECTOR          | string  | -         |                  |
| cache                                  | FLAGD_CACHE                    | string  | lru       | lru,disabled     |
| maxCacheSize                           | FLAGD_MAX_CACHE_SIZE           | int     | 1000      |                  |

Below are examples of usage patterns.

### Remote flag resolving over RPC

This is the default mode of operation of the provider.
In this mode, FlagdProvider communicates with flagd via the gRPC protocol.
Flag evaluations take place remotely at the connected [flagd](https://flagd.dev/) instance.

```ts
  OpenFeature.setProvider(new FlagdProvider())
```

In the above example, the provider expects flagd to be available at `localhost:8013` (default host and port).

Alternatively, you can use socket paths to connect to flagd.

```
  OpenFeature.setProvider(new FlagdProvider({
      socketPath: "/tmp/flagd.socks",
  }))
```

### In-process resolver

This mode performs flag evaluations locally (in-process).
Flag configurations for evaluation are obtained via gRPC protocol using [sync protobuf schema](https://buf.build/open-feature/flagd/file/main:sync/v1/sync_service.proto) service definition.

```
  OpenFeature.setProvider(new FlagdProvider({
      resolverType: 'in-process',
  }))
```

In the above example, the provider expects a flag sync service implementation to be available at `localhost:8013` (default host and port).

### Supported Events

The flagd provider emits `PROVIDER_READY`, `PROVIDER_ERROR` and `PROVIDER_CONFIGURATION_CHANGED` events.

| SDK event                        | Originating action in flagd                                                     |
| -------------------------------- | ------------------------------------------------------------------------------- |
| `PROVIDER_READY`                 | The streaming connection with flagd has been established.                       |
| `PROVIDER_ERROR`                 | The streaming connection with flagd has been broken.                            |
| `PROVIDER_CONFIGURATION_CHANGED` | A flag configuration (default value, targeting rule, etc) in flagd has changed. |

For general information on events, see the [official documentation](https://openfeature.dev/docs/reference/concepts/events).

### Flag Metadata

| Field   | Type   | Value                                             |
| ------- | ------ | ------------------------------------------------- |
| `scope` | string | "selector" set for the associated source in flagd |

## Building

Run `nx package providers-flagd` to build the library.

> NOTE: [Buf](https://docs.buf.build/installation) must be installed to build locally.

## Running Unit Tests

Run `nx test providers-flagd` to execute the unit tests via [Jest](https://jestjs.io).

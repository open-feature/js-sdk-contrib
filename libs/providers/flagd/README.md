# Server-Side flagd Provider

This provider is designed to use flagd's [evaluation protocol](https://github.com/open-feature/schemas/blob/main/protobuf/schema/v1/schema.proto), or locally evaluate flags defined in a flagd [flag definition](https://github.com/open-feature/schemas/blob/main/json/flagd-definitions.json).
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

| Option name                            | Environment variable name      | Type    | Default                                                        | Supported values |
| -------------------------------------- | ------------------------------ | ------- |----------------------------------------------------------------|------------------|
| host                                   | FLAGD_HOST                     | string  | localhost                                                      |                  |
| port                                   | FLAGD_PORT                     | number  | [resolver specific defaults](#resolver-type-specific-defaults) |                  |
| tls                                    | FLAGD_TLS                      | boolean | false                                                          |                  |
| socketPath                             | FLAGD_SOCKET_PATH              | string  | -                                                              |                  |
| certPath                               | FLAGD_SERVER_CERT_PATH         | string  | -                                                              |                  |
| resolverType                           | FLAGD_RESOLVER                 | string  | rpc                                                            | rpc, in-process  |
| offlineFlagSourcePath                  | FLAGD_OFFLINE_FLAG_SOURCE_PATH | string  | -                                                              |                  |
| selector                               | FLAGD_SOURCE_SELECTOR          | string  | -                                                              | rpc & in-process (see [Selector](#selector))  |
| cache                                  | FLAGD_CACHE                    | string  | lru                                                            | lru, disabled    |
| maxCacheSize                           | FLAGD_MAX_CACHE_SIZE           | int     | 1000                                                           |                  |
| defaultAuthority                       | FLAGD_DEFAULT_AUTHORITY        | string  | -                                                              | rpc, in-process  |
| keepAliveTime                          | FLAGD_KEEP_ALIVE_TIME_MS       | number  | 0                                                              | rpc, in-process  |
| retryBackoffMs                         | FLAGD_RETRY_BACKOFF_MS         | int     | 1000                                                           | in-process       |
| retryBackoffMaxMs                      | FLAGD_RETRY_BACKOFF_MAX_MS     | int     | 120000                                                         | in-process       |
| retryGracePeriod                       | FLAGD_RETRY_GRACE_PERIOD       | int     | 5                                                              |                  |
| fatalStatusCodes                       | FLAGD_FATAL_STATUS_CODES       | string[]| -                                                              |                  |

> [!NOTE]
> The `selector` option automatically uses the `flagd-selector` header (the preferred approach per [flagd#1814](https://github.com/open-feature/flagd/issues/1814)) while maintaining backward compatibility with older flagd versions. See [Selector](#selector) for details.

#### Resolver type-specific Defaults

| Option name                            | Environment variable name      |  in-process | rpc  | default |
| -------------------------------------- | ------------------------------ |-------------|------|---------|
| port                                   | FLAGD_PORT                     |  8015       | 8013 | 8013    |

Below are examples of usage patterns.

### Remote flag resolving over RPC

This is the default mode of operation of the provider.
In this mode, FlagdProvider communicates with flagd via the gRPC protocol.
Flag evaluations take place remotely on the connected [flagd](https://flagd.dev/) instance.

```ts
  OpenFeature.setProvider(new FlagdProvider())
```

In the above example, the provider expects flagd to be available at `localhost:8013` (default host and port).

Alternatively, you can use socket paths to connect to flagd.

```ts
  OpenFeature.setProvider(new FlagdProvider({
      socketPath: "/tmp/flagd.socks",
  }))
```

### In-process resolver

This mode performs flag evaluations locally (in-process).
Flag configurations for evaluation are obtained via gRPC protocol using [sync protobuf schema](https://buf.build/open-feature/flagd/file/main:sync/v1/sync_service.proto) service definition.

```ts
  OpenFeature.setProvider(new FlagdProvider({
      resolverType: 'in-process',
  }))
```

In the above example, the provider expects a flag sync service implementation to be available at `localhost:8015` (default host and port).

In-process resolver can also work in an offline mode.
To enable this mode, you should provide a valid flag configuration file with the option `offlineFlagSourcePath`.

```ts
  OpenFeature.setProvider(new FlagdProvider({
      resolverType: 'in-process',
      offlineFlagSourcePath: './flags.json',
  }))
```

Offline mode uses `fs.watchFile` and polls every 5 seconds for changes to the file.
This mode is useful for local development, test cases, and for offline applications.

### Selector

The `selector` option allows filtering flag configurations and evaluations based on flag sets or sources. This is useful when multiple flag configurations are available and you want to target a specific subset.

**RPC mode:**
```ts
  OpenFeature.setProvider(new FlagdProvider({
      selector: 'flagSetId=payment-flags',
  }))
```

**In-process mode:**
```ts
  OpenFeature.setProvider(new FlagdProvider({
      resolverType: 'in-process',
      selector: 'flagSetId=app-flags',
  }))
```

Or via environment variable:

```bash
export FLAGD_SOURCE_SELECTOR="flagSetId=app-flags"
```

> [!IMPORTANT]
> **Selector normalization ([flagd#1814](https://github.com/open-feature/flagd/issues/1814))**
>
> As part of [flagd#1814](https://github.com/open-feature/flagd/issues/1814), the flagd project is normalizing selector handling across all services (sync, evaluation, and OFREP) to use the `flagd-selector` gRPC metadata header.
>
> **Current implementation:**
> - The JS SDK **automatically passes the selector via the `flagd-selector` header** for both RPC and in-process modes
> - For in-process mode backward compatibility with older flagd versions, the selector is **also sent in the request body**
> - Both methods work with current flagd versions
> - In a future major version of flagd, the request body selector field may be removed
>
> **No migration needed:**
>
> Users do not need to make any code changes. The SDK handles selector normalization automatically.

### Default Authority usage (optional)

This is useful for complex routing or service-discovery use cases that involve a proxy (e.g., Envoy).
Please refer to this [GitHub issue](https://github.com/open-feature/js-sdk-contrib/issues/1187) for more information.

```ts
  OpenFeature.setProvider(new FlagdProvider({
      resolverType: 'in-process',
      defaultAuthority: 'b-target-api.service',
  }))
```

### Keepalive Configuration (optional)

gRPC keepalive prevents idle connections from being closed.
This option only applies to RPC and in-process resolvers (streaming connections).
Set to `0` to disable keepalive (default).

```ts
  OpenFeature.setProvider(new FlagdProvider({
      resolverType: 'in-process',
      keepAliveTime: 30000, // Send keepalive ping every 30 seconds
  }))
```

### Retry Grace Period (optional)

The `retryGracePeriod` controls how long (in seconds) the provider will retry reconnecting before transitioning from `STALE` to `ERROR` state:

```ts
  OpenFeature.setProvider(new FlagdProvider({
      retryGracePeriod: 5, // Retry for 5 seconds before moving to ERROR state
  }))
```

### Fatal Status Codes (optional)

Configure which gRPC status codes should be treated as fatal errors on the first connection attempt.
When a fatal status code is encountered during initial connection, the provider will not retry and will emit a `PROVIDER_FATAL` error.

```ts
OpenFeature.setProvider(new FlagdProvider({
  fatalStatusCodes: ['UNAUTHENTICATED', 'PERMISSION_DENIED']
}))
```

### Supported Events

The flagd provider emits `PROVIDER_READY`, `PROVIDER_ERROR` and `PROVIDER_CONFIGURATION_CHANGED` events.

| SDK event                        | Originating action in flagd                                                     |
| -------------------------------- | ------------------------------------------------------------------------------- |
| `PROVIDER_READY`                 | The streaming connection with flagd has been established.                       |
| `PROVIDER_ERROR`                 | The streaming connection with flagd has been broken.                            |
| `PROVIDER_CONFIGURATION_CHANGED` | A flag configuration (default value, targeting rule, etc) in flagd has changed. |

For general information on events, see the [official documentation](https://openfeature.dev/docs/reference/concepts/events).

### Flag Metadata

[Flag metadata](https://flagd.dev/reference/flag-definitions/#metadata) is a set of key-value pairs that can be associated with a flag.
The values come from the flag definition in flagd.

## Building

Run `nx package providers-flagd` to build the library.

> NOTE: [Buf](https://docs.buf.build/installation) must be installed to build locally.

## Running Unit Tests

Run `nx test providers-flagd` to execute the unit tests via [Jest](https://jestjs.io).

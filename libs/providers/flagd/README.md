# Server-side JavaScript flagd Provider for OpenFeature

Flagd is a simple daemon for evaluating feature flags.
It is designed to conform to OpenFeature schema for flag definitions.
This repository and package provides the client code for interacting with it via the OpenFeature server-side JavaScript SDK.

## Installation

```
$ npm install @openfeature/flagd-provider
```

Required peer dependencies

```
$ npm install @openfeature/js-sdk
```

## Usage

The `FlagdProvider` supports multiple configuration options that determine now the SDK communicates with flagd.
Options can be defined in the constructor or as environment variables, with constructor options having the highest precedence.

### Available options

| Option name | Environment variable name | Type    | Default   |
| ----------- | ------------------------- | ------- | --------- |
| host        | FLAGD_HOST                | string  | localhost |
| port        | FLAGD_PORT                | number  | 8013      |
| tls         | FLAGD_TLS                 | boolean | false     |
| socketPath  | FLAGD_SOCKET_PATH         | string  | -         |

### Example using TCP

```
  OpenFeature.setProvider(new FlagdProvider({
      host: 'localhost',
      port: 8013,
  }))
```

### Example using a Unix socket

```
  OpenFeature.setProvider(new FlagdProvider({
      socketPath: "/tmp/flagd.socks",
  }))
```

## Building

Run `nx package providers-flagd` to build the library.

> NOTE: [Buf](https://docs.buf.build/installation) must be installed to build locally.

## Running unit tests

Run `nx test providers-flagd` to execute the unit tests via [Jest](https://jestjs.io).

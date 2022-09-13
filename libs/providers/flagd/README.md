# NodeJS flagd Provider for OpenFeature

![Experimental](https://img.shields.io/badge/experimental-breaking%20changes%20allowed-yellow)

Flagd is a simple command line tool for fetching and presenting feature flags to services. It is designed to conform to OpenFeature schema for flag definitions. This repository and package provides the client side code for interacting with it via the Open-Feature Node SDK.

## Installation

```
$ npm install @openfeature/flagd-provider
```

## Building

Run `nx package providers-flagd` to build the library.

> NOTE: [Buf](https://docs.buf.build/installation) must be installed to build locally.

## Running unit tests

Run `nx test providers-flagd` to execute the unit tests via [Jest](https://jestjs.io).

## Usage

The `FlagdProvider` client constructor takes a single optional argument with 3 fields, their default values correspond to the default arguments supplied to the flagd server:

### Example using TCP

```
  OpenFeature.setProvider(new FlagdProvider({
      host: 'localhost',
      port: 8013,
      protocol: 'http'
  }))
```

### Example using a Unix socket

```
  OpenFeature.setProvider(new FlagdProvider({
      socketPath: "/tmp/flagd.socks",
  }))
```

**service**: "http" | "grpc" _(defaults to http)_  
**host**: string _(defaults to "localhost")_  
**port**: number _(defaults to 8013)_  
**protocol**: "http" | "https" _(defaults to http - only active for http service)_
**socketPath**: string _(optional and only applies when using grpc)_

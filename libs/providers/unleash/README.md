# unleash Provider

## About this provider

This provider is a community-developed implementation for Unleash which uses the official [Node Server-side SDK](https://docs.getunleash.io/reference/sdks/node).

### Concepts

- Boolean evaluation gets feature enabled status.
- String, Number, and Object evaluation gets feature variant value.
- Object evaluation should be used for JSON/CSV payloads in variants.

## Installation

```shell
$ npm install @openfeature/unleash-provider @openfeature/server-sdk
```

## Usage

To initialize the OpenFeature client with Unleash, you can use the following code snippets:

### Initialization

```ts
import { UnleashProvider } from '@openfeature/unleash-provider';

const provider = new UnleashProvider({
  url: 'https://YOUR-API-URL',
  appName: 'your app',
  customHeaders: { Authorization: 'your api key' },
});

await OpenFeature.setProviderAndWait(provider);
```

### Available Constructor Configuration Options

Unleash has a variety of configuration options that can be provided to the `UnleashProvider` constructor.

Please refer to the options described in the official [Node Server-side SDK](https://docs.getunleash.io/reference/sdks/node).

### After initialization

After the provider gets initialized, you can start evaluations of feature flags like so:

```ts
// Get the client
const client = await OpenFeature.getClient();

// You can now use the client to evaluate your flags
const details = client.getBooleanValue('my-feature', false);
```

The static evaluation context can be changed if needed

```ts
const evaluationCtx: EvaluationContext = {
  usedId: 'theuser',
  currentTime: 'time',
  sessionId: 'theSessionId',
  remoteAddress: 'theRemoteAddress',
  environment: 'theEnvironment',
  appName: 'theAppName',
  aCustomProperty: 'itsValue',
  anotherCustomProperty: 'somethingForIt',
};

// changes the static evaluation context for OpenFeature
await OpenFeature.setContext(evaluationCtx);
```

## Contribute

### Building

Run `nx package providers-unleash` to build the library.

### Running unit tests

Run `nx test providers-unleash` to execute the unit tests via [Jest](https://jestjs.io).

# unleash-web Provider

## About this provider

This provider is a community-developed implementation for Unleash which uses the official [Unleash Proxy Client for the browser Client Side SDK](https://docs.getunleash.io/reference/sdks/javascript-browser).

This provider uses a **static evaluation context** suitable for client-side implementation.

Suitable for connecting to an Unleash instance

* Via the [Unleash front-end API](https://docs.getunleash.io/reference/front-end-api).
* Via [Unleash Edge](https://docs.getunleash.io/reference/unleash-edge).
* Via [Unleash Proxy](https://docs.getunleash.io/reference/unleash-proxy).

[Gitlab Feature Flags](https://docs.gitlab.com/ee/operations/feature_flags.html) can also be used with this provider - although note that Unleash Edge is not currently supported by Gitlab.

### Concepts
* Boolean evaluation gets feature enabled status.
* String, Number, and Object evaluation gets feature variant value.
* Object evaluation should be used for JSON/CSV payloads in variants.

## Installation

```shell
$ npm install @openfeature/unleash-web-provider @openfeature/web-sdk
```

## Usage

To initialize the OpenFeature client with Unleash, you can use the following code snippets:

### Initialization - without context

```ts
import { UnleashWebProvider } from '@openfeature/unleash-web-provider';

const provider = new UnleashWebProvider({
    url: 'http://your.upstream.unleash.instance',
    clientKey: 'theclientkey',
    appName: 'your app',
});
  
await OpenFeature.setProviderAndWait(provider);
```

### Initialization - with context

The [Unleash context](https://docs.getunleash.io/reference/unleash-context) can be set during creation of the provider.

```ts
import { UnleashWebProvider } from '@openfeature/unleash-web-provider';

const context = {
    userId: '123',
    sessionId: '456',
    remoteAddress: 'address',
    properties: {
        property1: 'property1',
        property2: 'property2',
    },
};

const provider = new UnleashWebProvider({
    url: 'http://your.upstream.unleash.instance',
    clientKey: 'theclientkey',
    appName: 'your app',
    context: context,
});
  
await OpenFeature.setProviderAndWait(provider);
```


### Available Constructor Configuration Options

Unleash has a variety of configuration options that can be provided to the `UnleashWebProvider` constructor.

Please refer to the options described in the official [Unleash Proxy Client for the browser Client Side SDK](https://docs.getunleash.io/reference/sdks/javascript-browser#available-options).




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

Run `nx package providers-unleash-web` to build the library.

### Running unit tests

Run `nx test providers-unleash-web` to execute the unit tests via [Jest](https://jestjs.io).

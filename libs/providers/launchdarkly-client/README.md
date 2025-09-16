# launchdarkly-client Provider

![Experimental](https://img.shields.io/badge/experimental-breaking%20changes%20allowed-yellow)

An unofficial browser provider for LaunchDarkly.

## Installation

```
$ npm install @openfeature/launchdarkly-client-provider
```

## Sample initialization

```ts
import { LaunchDarklyClientProvider } from '@openfeature/launchdarkly-client-provider';

// initialize provider
const clientEnvKey = 'LDEnvironmentID';

/*
 * optional launch darkly options
 * @see https://launchdarkly.github.io/js-client-sdk/interfaces/LDOptions.html
 */
const ldOptions = {
  streaming: true,
};

/*
  * initialization happens inside the provider, the initial context will be { anonymous: true } by default if there is not context set in Open Feature.
  * @see https://launchdarkly.github.io/js-client-sdk/interfaces/LDContextCommon.html#anonymous
  * you can change it using setContext. 

  */
const ldOpenFeatureProvider = new LaunchDarklyClientProvider(clientEnvKey, ldOptions);

//set open feature provider and get client
OpenFeature.setProvider(ldOpenFeatureProvider);
const client = OpenFeature.getClient('my-client');

//use client
const boolValue = client.getBooleanValue('boolFlag', false);
```

To opt in for streaming, you should set `"streaming: true"` explicitly, that guarantee you set the appropriate listeners and you enable streaming in the LD SDK

## Update Context

For context update always use `OpenFeature.setContext(myNewContext);`

Please note that context changes result in network traffic, so changes should be made sparingly in accordance to relevant user behavior.

```ts
await OpenFeature.setContext({ targetingKey: 'my-key' });
//Laundarkly uses key but this provider tranlates targetingKey to key;
//So the above is the same as doing
await OpenFeature.setContext({ key: 'my-key' });
```

Read more about LD contexts [here](https://launchdarkly.github.io/js-client-sdk/interfaces/LDContextCommon.html)

## Tracking

You can send custom events to LaunchDarkly metrics for use in
experiments and guarded rollouts. To learn more, read [Sending custom events](https://launchdarkly.com/docs/sdk/features/events).

```ts
const client = await OpenFeature.getClient();
client.track('event-key-123abc', { customProperty: someValue })
```

## Building

Run `nx package providers-launchdarkly-client` to build the library.

## Running unit tests

Run `nx test providers-launchdarkly-client` to execute the unit tests via [Jest](https://jestjs.io).

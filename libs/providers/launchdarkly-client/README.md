# launchdarkly-client Provider

![Experimental](https://img.shields.io/badge/experimental-breaking%20changes%20allowed-yellow)

## Installation

```
$ npm install @openfeature/launchdarkly-client-provider
```

## Building

Run `nx package providers-launchdarkly-client` to build the library.

## Running unit tests

Run `nx test providers-launchdarkly-client` to execute the unit tests via [Jest](https://jestjs.io).

## Sample initialization
``` ts
  // init launchdarkly-js-client-sdk
  const initialContext = {};
  const ldClient =  initialize('LDId', initialContext);
  await ldClient.waitForInitialization();
  const ldOpenFeatureProvider = new LaunchDarklyClientProvider(ldClient);

  //set open feature provider and get client
  OpenFeature.setProvider(ldOpenFeatureProvider);
  const client = OpenFeature.getClient('my-client');

  //use client
  const boolValue = client.getBooleanValue('boolFlag', false);
```
## Update Context
For context update always use ``OpenFeature.setContext(myNewContext);`` instead of ``ldClient.identify(myNewContext);``, as this will always be handled internally.
``` ts
  await OpenFeature.setContext({ targetingKey: 'my-key' })
  //Laundarkly uses key but this provider tranlates targetingKey to key; 
  //So the above is the same as doing
  await OpenFeature.setContext({ key: 'my-key' });
```

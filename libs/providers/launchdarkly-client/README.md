# launchdarkly-client Provider

![Experimental](https://img.shields.io/badge/experimental-breaking%20changes%20allowed-yellow)

An unofficial browser provider for LaunchDarkly.

## Installation

```
$ npm install @openfeature/launchdarkly-client-provider
```

## Sample initialization
``` ts
  // init launchdarkly-js-client-sdk
  const initialContext = {
    anonymous: true,
  };
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

Please note that context changes result in network traffic, so changes should be made sparingly in accordance to relevant user behavior.
``` ts
  await OpenFeature.setContext({ targetingKey: 'my-key' })
  //Laundarkly uses key but this provider tranlates targetingKey to key; 
  //So the above is the same as doing
  await OpenFeature.setContext({ key: 'my-key' });
```

Read more about LD contexts [here](https://github.com/launchdarkly/openfeature-node-server#openfeature-specific-considerations)

## Building

Run `nx package providers-launchdarkly-client` to build the library.

## Running unit tests

Run `nx test providers-launchdarkly-client` to execute the unit tests via [Jest](https://jestjs.io).

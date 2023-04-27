# launchdarkly-client Provider

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
import {initialize} from 'launchdarkly-js-client-sdk'; 

const initialContext = {};
const ldClient =  initialize('LDId', initialContext);
await ldClient.waitForInitialization()
const ldOpenFeatureProvider = new LaunchDarklyClientProvider(ldClient);

OpenFeature.setProvider(ldOpenFeatureProvider);
```

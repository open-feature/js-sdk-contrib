# Flagsmith Provider

This provider is an implementation for the [JavaScript SDK](https://docs.flagsmith.com/clients/javascript/) of [Flagsmith](https://flagsmith.com).

## Installation

```
npm install @openfeature/flagsmith-provider @openfeature/web-sdk
```

## Initialising the provider

The Flagsmith Provider can be created with the standard [initialization options](https://docs.flagsmith.com/clients/javascript/#example-initialising-the-sdk) and an optional Flagsmith instance to use.

```javascript
import { FlagsmithProvider } from '@openfeature/flagsmith-provider';
import { OpenFeature } from '@openfeature/web-sdk';

const flagsmithFeatureFlagWebProvider = new FlagsmithProvider({
    environmentID: '<ENVIRONMENT_ID>'
});
OpenFeature.setProvider(flagsmithFeatureFlagWebProvider); // Attach the provider to OpenFeature
```

## Usage with React Native, SSR or custom instances

The Flagsmith Provider can be constructed with a custom Flagsmith instance and optional server-side generated state, [initialization options](https://docs.flagsmith.com/clients/javascript/#example-initialising-the-sdk).

Note: In order to use the React Native implementation of OpenFeature you will need to install both Flagsmith and react-native-flagsmith.

```javascript
import flagsmith from 'react-native-flagsmith' // Could also be flagsmith/isomorphic, flagsmith-es or createFlagsmithInstance()
import { FlagsmithProvider } from '@openfeature/flagsmith-provider';
import { OpenFeature } from '@openfeature/web-sdk';

const flagsmithFeatureFlagWebProvider = new FlagsmithProvider({
    environmentID: '<ENVIRONMENT_ID>',
    flagsmithInstance: flagsmith,
    state:serverState
});
OpenFeature.setProvider(flagsmithFeatureFlagWebProvider); // Attach the provider to OpenFeature
```

## Identifying and setting Traits

In Flagsmith, users are [identified](https://docs.flagsmith.com/clients/javascript/#identifying-users) in order to allow for segmentation and percentage rollouts.

To identify and set traits you can specify a targetingKey(identity) and optionally a set of traits. This will do the equivalent of ``flagsmith.identify(id, traits)`` or pass these to ``flagsmith.init`` if you are calling this before ``OpenFeature.setProvider``.
```javascript
const flagsmithFeatureFlagWebProvider = new FlagsmithProvider({
    environmentID: '<ENVIRONMENT_ID>',
});
await OpenFeature.setContext({ targetingKey, traits });
OpenFeature.setProvider(flagsmithFeatureFlagWebProvider); // Attach the provider to OpenFeature
```

To reset the identity you can simply reset the context. This will do the equivalent of ``flagsmith.logout()`` 

```javascript
await OpenFeature.setContext({ });
```

## Resolution reasoning

In Flagsmith, features are evaluated based on the following  [Resolution reasons](https://openfeature.dev/specification/types/#resolution-details):

```typescript
StandardResolutionReasons.CACHED | StandardResolutionReasons.STATIC | StandardResolutionReasons.DEFAULT | StandardResolutionReasons.ERROR
```

Note that resolutions of type SPLIT may be the result of targetted matching or percentage split however Flagsmith does not expose this information to client-side SDKs.


## Events

The Flagsmith provider emits the
following [OpenFeature events](https://openfeature.dev/specification/types#provider-events):

- PROVIDER_READY
- PROVIDER_ERROR
- PROVIDER_CONFIGURATION_CHANGED

## Building

Run `nx package providers-flagsmith` to build the library.

## Running unit tests

Run `nx test providers-flagsmith` to execute the unit tests via [Jest](https://jestjs.io).

## Examples

You can find examples using this provider in several frameworks [Here](https://github.com/Flagsmith/flagsmith-js-examples/tree/main/open-feature).

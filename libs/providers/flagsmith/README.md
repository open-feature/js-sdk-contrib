# Flagsmith Provider

This provider is an implementation for the [JavaScript SDK](https://docs.flagsmith.com/clients/javascript/) of [Flagsmith](https://flagsmith.com).

## Installation

```
npm install @openfeature/flagsmith-provider @openfeature/web-sdk
```

## Initialising the provider

The Flagsmith Provider can be created with the standard [initialization options](https://docs.flagsmith.com/clients/javascript/#example-initialising-the-sdk) as well as a logger and custom Flagsmi.

```javascript
import { FlagsmithWebProvider } from '../lib/flagsmith-provider';

const flagsmithFeatureFlagWebProvider = new FlagsmithWebProvider({
    environmentID: '<ENVIRONMENT_ID>',
    logger
});
OpenFeature.setProvider(flagsmithFeatureFlagWebProvider); // Attach the provider to OpenFeature
const client = await OpenFeature.getClient();
```

## Usage with React Native / SSO 

The Flagsmith Provider can be constructed with a custom flagsmith instance, [initialization options](https://docs.flagsmith.com/clients/javascript/#example-initialising-the-sdk).

```javascript
import { FlagsmithWebProvider } from '../lib/flagsmith-provider';

const flagsmithFeatureFlagWebProvider = new FlagsmithWebProvider({
    environmentID: '<ENVIRONMENT_ID>',
    // ...
}, logger);
OpenFeature.setProvider(flagsmithFeatureFlagWebProvider); // Attach the provider to OpenFeature
const client = await OpenFeature.getClient();
```

## Identifying and setting Traits

In Flagsmith, users are [identified](https://docs.flagsmith.com/clients/javascript/#identifying-users) in order to allow for segmentation and percentage rollouts.


```typescript
StandardResolutionReasons.CACHED | StandardResolutionReasons.STATIC | StandardResolutionReasons.DEFAULT
```

Note that resolutions of type SPLIT may be the result of targetted matching or percentage split however Flagsmith does not expose this information to client-side users.


## Resolution reasoning

In Flagsmith, features are evaluated based on the following  [Resolution reasons](https://openfeature.dev/specification/types/#resolution-details):

```typescript
StandardResolutionReasons.CACHED | StandardResolutionReasons.STATIC | StandardResolutionReasons.DEFAULT
```

Note that resolutions of type SPLIT may be the result of targetted matching or percentage split however Flagsmith does not expose this information to client-side users.


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

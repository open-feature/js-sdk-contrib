# Flagsmith OpenFeature provider for client-side JavaScript

[Flagsmith](https://flagsmith.com) is an open-source feature flagging and remote configuration service. This provider implements the [Flagsmith JavaScript SDK](https://flagsmith.com/docs/clients/javascript/) for client-side applications.

## Installation

```
npm install @openfeature/flagsmith-client-provider
```

Make sure that the SDK version is compatible with the `peerDependencies` one.

## Initializing the provider

The Flagsmith OpenFeature provider can be created with the same [initialization options as the Flagsmith SDK](https://docs.flagsmith.com/clients/javascript/#initialisation-options).

```javascript
import { FlagsmithClientProvider } from '@openfeature/flagsmith-client-provider';
import { OpenFeature } from '@openfeature/web-sdk';

const flagsmithClientProvider = new FlagsmithClientProvider({
  environmentID: 'your_client_side_environment_key',
  cacheFlags: true,
  cacheOptions: {
    skipAPI: true,
  },
});
OpenFeature.setProvider(flagsmithClientProvider);
```

## Examples

See our [examples repository](https://github.com/Flagsmith/flagsmith-js-examples/tree/main/open-feature) for usage with various frameworks.

## Usage with React Native

To use the React Native implementation of OpenFeature, install `react-native-flagsmith`:

```
npm install flagsmith react-native-flagsmith
```

Then, pass the `flagsmith` instance from `react-native-flagsmith` when initializing the provider:

```javascript
import flagsmith from 'react-native-flagsmith';
import { FlagsmithClientProvider } from '@openfeature/flagsmith-client-provider';
import { OpenFeature } from '@openfeature/web-sdk';

const flagsmithClientProvider = new FlagsmithClientProvider({
  environmentID: 'your_client_side_environment_key',
  flagsmithInstance: flagsmith,
});
OpenFeature.setProvider(flagsmithClientProvider);
```

See the [React Native example application](https://github.com/Flagsmith/flagsmith-js-examples/tree/main/open-feature/reactnative) for more details.

## Flag targeting and dynamic evaluation

In Flagsmith, users can be [identified](https://docs.flagsmith.com/clients/javascript/#identifying-users) to perform targeted flag rollouts.
Traits are key-value pairs that can be used for [segment-based](https://docs.flagsmith.com/basic-features/segments) targeting.

Flagsmith identifiers and traits make up the [OpenFeature evaluation context](https://openfeature.dev/specification/glossary/#evaluation-context).
They correspond to OpenFeature [targeting keys](https://openfeature.dev/docs/reference/concepts/evaluation-context/#targeting-key) and context attributes respectively:

```javascript
await OpenFeature.setContext({
  targetingKey: 'my-identity-id',
  traits: {
    myTraitKey: 'my-trait-value',
  },
});
```

To reset the identity, set the context to an empty object:

```javascript
await OpenFeature.setContext({});
```

## Resolution reasons

This provider supports the following [resolution reasons](https://openfeature.dev/specification/types/#resolution-reason):

```typescript
import { StandardResolutionReasons } from '@openfeature/web-sdk';

type FlagsmithResolutionReasons =
  | typeof StandardResolutionReasons.STATIC
  | typeof StandardResolutionReasons.CACHED
  | typeof StandardResolutionReasons.DEFAULT
  | typeof StandardResolutionReasons.ERROR;
```

## Events

This provider emits the following [events](https://openfeature.dev/specification/types#provider-events):

```typescript
import { ProviderEvents } from '@openfeature/web-sdk';

type FlagsmithProviderEvents =
  | typeof ProviderEvents.Ready
  | typeof ProviderEvents.Stale
  | typeof ProviderEvents.ConfigurationChanged
  | typeof ProviderEvents.Error;
```

## Building

Run `nx package providers-flagsmith-client` to build the library.

## Running unit tests

Run `nx test providers-flagsmith-client` to execute the unit tests via [Jest](https://jestjs.io).

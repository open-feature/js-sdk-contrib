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

To use the React Native implementation of OpenFeature, install `@flagsmith/react-native`:

```
npm install @flagsmith/flagsmith @flagsmith/react-native
```

Then, pass the `flagsmith` instance from `@flagsmith/react-native` when initializing the provider:

```javascript
import flagsmith from '@flagsmith/react-native';
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
  | typeof StandardResolutionReasons.DISABLED
  | typeof StandardResolutionReasons.TARGETING_MATCH
  | typeof StandardResolutionReasons.ERROR;
```

- `DISABLED` — the flag exists but is turned off in Flagsmith. Boolean evaluations resolve `false`; other types return the configured value when the flag has one, otherwise the caller's default. Check `flagMetadata.enabled` to distinguish it.
- `TARGETING_MATCH` — the flag was evaluated for an identified user (`targetingKey` set) from fresh server flags.

## Flag metadata

Resolutions backed by an existing Flagsmith flag carry [flag metadata](https://openfeature.dev/specification/types/#flag-metadata): `enabled` and `featureId`. Multivariate flags additionally expose their variant as `ResolutionDetails.variant` and the experiment convention keys `experiment.arm`, `experiment.active` and `experiment.unit`. Missing flags resolve to the caller's default without metadata.

## Tracking (experimental)

> OpenFeature tracking ([spec §6](https://openfeature.dev/specification/sections/tracking)) and Flagsmith's
> events pipeline are both experimental; this surface may change.

The provider implements `track()`. Enable the Flagsmith events pipeline by passing `enableEvents: true`
when constructing the provider.

Plain product events map to Flagsmith events — `details.value` must be numeric, other keys become metadata:

```javascript
const client = OpenFeature.getClient();
client.track('purchase', { value: 99.77, plan: 'pro' });
```

### Recording experiment exposures

Exposures mark an identity as having entered an experiment, and are deliberately decoupled from
evaluation — flags are evaluated in places users never see (prefetch, background renders), so the
provider never records exposures automatically. There are three ways to record one:

**1. Exposure hook (recommended) — one call, evaluate and expose.** Attach `FlagsmithExposureHook`
at the call site where the experiment starts; the attachment is the experiment declaration:

```javascript
import { FlagsmithExposureHook } from '@openfeature/flagsmith-client-provider';

const exposureHook = new FlagsmithExposureHook(flagsmithClientProvider);
const client = OpenFeature.getClient();

const details = client.getStringDetails('my_experiment_flag', 'control', { hooks: [exposureHook] });
```

The hook records an exposure for the resolved variant when the flag is multivariate and resolved
with reason `TARGETING_MATCH` (enabled, server-sourced, identified context), deduped per
identity/flag/variant. Evaluations of the same flag elsewhere — without the hook — record nothing.

**2. Explicit tracking.** Use the reserved event name exported as `EXPOSURE_TRACKING_EVENT`
(`"feature_flag.exposure"`) when you need full control over when the exposure fires:

```javascript
import { EXPOSURE_TRACKING_EVENT } from '@openfeature/flagsmith-client-provider';

const details = client.getStringDetails('my_experiment_flag', 'control');
client.track(EXPOSURE_TRACKING_EVENT, { flagKey: 'my_experiment_flag', variant: details.variant });
```

Omit `variant` to let the provider resolve the flag and apply the experiment guards (flag exists,
enabled, has a variant, server-sourced).

**3. The Flagsmith client directly.** The provider exposes its client (`provider.flagsmithClient`),
so Flagsmith's native experiment surface — `getExperimentFlag()`, or `useExperiment` via a
[shared instance](#sharing-one-flagsmith-instance-with-the-flagsmith-react-sdk) — remains available
when you want first-party semantics at the cost of coupling that call site to Flagsmith:

```javascript
const flag = flagsmithClientProvider.flagsmithClient.getExperimentFlag('my_experiment_flag');
if (flag?.enabled && flag.variant === 'treatment') {
  // exposure already recorded by the call above; render the treatment experience
}
```

In all cases:

- Exposures require an identified context (`targetingKey`); anonymous exposures are skipped and logged.
  For anonymous experiments, use a stable device or session id as the `targetingKey`.
- Event names starting with `$` are reserved and dropped with a warning.

## Sharing one Flagsmith instance with the Flagsmith React SDK

The provider accepts a custom instance (`flagsmithInstance`) and exposes it (`provider.flagsmithClient`),
so OpenFeature and [Flagsmith's React SDK](https://docs.flagsmith.com/clients/react) can share one
client — one set of flags, one identity. The provider only stops a client it created: closing it
flushes pending events but leaves a shared instance running for its other consumers.

```jsx
import { createFlagsmithInstance } from '@flagsmith/flagsmith';
import { FlagsmithProvider } from '@flagsmith/flagsmith/react';
import { OpenFeatureProvider } from '@openfeature/react-sdk';
import { OpenFeature } from '@openfeature/web-sdk';
import { FlagsmithClientProvider } from '@openfeature/flagsmith-client-provider';

const flagsmith = createFlagsmithInstance();
const provider = new FlagsmithClientProvider({
  environmentID: 'your_client_side_environment_key',
  flagsmithInstance: flagsmith,
});
await OpenFeature.setContext({ targetingKey: userId });
await OpenFeature.setProviderAndWait(provider);

<OpenFeatureProvider>
  <FlagsmithProvider flagsmith={flagsmith}>
    <App />
  </FlagsmithProvider>
</OpenFeatureProvider>;
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

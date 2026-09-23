# growthbook Provider

## Installation

```
$ npm install @openfeature/growthbook-provider
```

## Example Setup

```typescript
import { GrowthBookClient, ClientOptions, InitOptions } from '@growthbook/growthbook';
import { GrowthbookProvider } from '@openfeature/growthbook-provider';
import { OpenFeature } from '@openfeature/server-sdk';

/*
 * Configure your GrowthBook instance with GrowthBook context
 * @see https://docs.growthbook.io/lib/js#step-1-configure-your-app
 */
const gbClientOptions: ClientOptions = {
  apiHost: 'https://cdn.growthbook.io',
  clientKey: 'sdk-abc123',
  // Only required if you have feature encryption enabled in GrowthBook
  decryptionKey: 'key_abc123',
};

/*
 * optional init options
 * @see https://docs.growthbook.io/lib/js#switching-to-init
 */
const initOptions: InitOptions = {
  timeout: 2000,
  streaming: true,
};

OpenFeature.setProvider(new GrowthbookProvider(gbClientOptions, initOptions));
```

## Evaluation context

GrowthBook buckets users on the `id` attribute. The provider maps OpenFeature's
`targetingKey` onto `id` for you, so a standard evaluation context works:

```typescript
await client.getBooleanValue('my-flag', false, { targetingKey: 'user-123' });
```

If you set an `id` attribute explicitly it takes precedence over `targetingKey`.
All attributes — the targeting key included, under its own `targetingKey` name —
pass through to GrowthBook unchanged, so existing rules that reference
`targetingKey` directly keep matching.

## Tracking

OpenFeature tracking events are forwarded to GrowthBook via `logEvent`. The
evaluation context becomes the GrowthBook user context, so the event is
attributed to the same user your flags are bucketed for.

```typescript
client.track('purchase', { targetingKey: 'user-123' }, { value: 42 });
```

## Building

Run `nx package providers-growthbook` to build the library.

## Running unit tests

Run `nx test providers-growthbook` to execute the unit tests via [Jest](https://jestjs.io).

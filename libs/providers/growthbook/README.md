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

### Evaluation reasons

GrowthBook's evaluation `source` is mapped onto the standard OpenFeature reasons,
and the raw source is kept in flag metadata:

| GrowthBook source        | OpenFeature reason | Error code       |
| ------------------------ | ------------------ | ---------------- |
| `experiment`             | `SPLIT`            |                  |
| `force`                  | `TARGETING_MATCH`  |                  |
| `override`               | `STATIC`           |                  |
| `prerequisite` (blocked) | `DEFAULT`          |                  |
| `defaultValue`           | `DEFAULT`          |                  |
| `unknownFeature`         | `ERROR`            | `FLAG_NOT_FOUND` |
| `cyclicPrerequisite`     | `ERROR`            | `PARSE_ERROR`    |

The `force` mapping is lossy by necessity: GrowthBook reports `force` for forced rules whether or not the rule carried conditions or rollout coverage, and the result does not include the rule definition. Consumers needing the distinction can read `flagMetadata.source` and the rule id. A prerequisite-blocked feature returns the caller's default value, which is why it reports `DEFAULT` rather than an error.

```typescript
const details = await client.getBooleanDetails('my-flag', false, context);
details.reason; // 'SPLIT'
details.flagMetadata.source; // 'experiment'
```

## Building

Run `nx package providers-growthbook` to build the library.

## Running unit tests

Run `nx test providers-growthbook` to execute the unit tests via [Jest](https://jestjs.io).

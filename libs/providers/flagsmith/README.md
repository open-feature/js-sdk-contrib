# Flagsmith Provider

This is an OpenFeature provider implementation for using [Flagsmith](https://flagsmith.com), a managed feature flag and remote config platform for Node.js applications.

## Installation

```bash
npm install @openfeature/flagsmith-provider @openfeature/server-sdk@^1.19 flagsmith-nodejs@^6.1
```

## Usage

The Flagsmith provider uses the [Flagsmith Node.js SDK](https://docs.flagsmith.com/clients/server-side).

It can be created by passing a configured Flagsmith client instance to the `FlagsmithOpenFeatureProvider` constructor.

### Example using the default configuration

```javascript
import { OpenFeature } from '@openfeature/server-sdk';
import { FlagsmithOpenFeatureProvider } from '@openfeature/flagsmith-provider';
import { Flagsmith } from 'flagsmith-nodejs';

// Create the Flagsmith client
const flagsmith = new Flagsmith({
  environmentKey: '<your_environment_key>',
});

// Create and set the provider
const provider = new FlagsmithOpenFeatureProvider(flagsmith);
await OpenFeature.setProviderAndWait(provider);

// Obtain a client instance and evaluate feature flags
const client = OpenFeature.getClient();

const value = await client.getBooleanValue('my-flag', false, { targetingKey: 'user-123' });
console.log(`my-flag: ${value}`);

// On application shutdown, clean up the OpenFeature provider
await OpenFeature.clearProviders();
```

### Example using custom configuration

```javascript
import { OpenFeature } from '@openfeature/server-sdk';
import FlagsmithOpenFeatureProvider from '@openfeature/flagsmith-provider';
import Flagsmith from 'flagsmith-nodejs';

// Create the Flagsmith client with custom options
const flagsmith = new Flagsmith({
  environmentKey: '<your_environment_key>',
  enableLocalEvaluation: true,
  retries: 3,
});

// Create the provider with custom configuration
const provider = new FlagsmithOpenFeatureProvider(flagsmith, {
  returnValueForDisabledFlags: true,
  useFlagsmithDefaults: true,
  useBooleanConfigValue: false,
});

await OpenFeature.setProviderAndWait(provider);

// ...
```

## Configuration Options

The provider accepts the following configuration options:

| Option                        | Type      | Default | Description                                                                                                                                                                                          |
| ----------------------------- | --------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `returnValueForDisabledFlags` | `boolean` | `false` | If `true`, returns flag values even when disabled. If `false`, throws error for disabled flags (except boolean flags which return `false` with reason `DISABLED` when `useBooleanConfigValue=false`) |
| `useFlagsmithDefaults`        | `boolean` | `false` | If `true`, allows using Flagsmith default flag values. If `false`, returns default value with error code for missing flags                                                                           |
| `useBooleanConfigValue`       | `boolean` | `false` | If `true`, returns `flag.value` for boolean flags. If `false`, returns `flag.enabled`                                                                                                                |

## Evaluation Context

The OpenFeature Evaluation Context is mapped to Flagsmith's identity and traits system.

### Identity Resolution

- If `targetingKey` is provided in the evaluation context, the provider will use `getIdentityFlags()` to retrieve flags for that specific identity
- If no `targetingKey` is provided, the provider will use `getEnvironmentFlags()` to retrieve environment-level flags

### Traits

The `traits` field in the evaluation context is passed directly to Flagsmith as user traits for targeting and segmentation.

#### Example

```javascript
const evaluationContext = {
  targetingKey: 'user-123',
  traits: {
    email: 'user@example.com',
    plan: 'premium',
    age: 25,
  },
};

const value = await client.getBooleanValue('premium-feature', false, evaluationContext);
```

## Flag Value Types

The provider supports all OpenFeature flag value types:

- **Boolean**: Returns `flag.enabled` by default, or `flag.value` if `useBooleanConfigValue` is true
- **String**: Returns the flag value as-is if it's a string
- **Number**: Attempts to parse the flag value as a number
- **Object**: Attempts to parse the flag value as JSON

## Error Handling

The provider handles various error scenarios:

- **Flag Not Found**: Returns default value with `FLAG_NOT_FOUND` error code
- **Type Mismatch**: Returns default value with `TYPE_MISMATCH` error code if flag value cannot be converted to requested type
- **Disabled Flags**:  
  – For boolean flags with `useBooleanConfigValue=false`: returns `false` with reason `DISABLED`  
  – For other flags: throws `GeneralError` unless `returnValueForDisabledFlags` is `true`
- **General Errors**: Throws `GeneralError` for client communication issues

## Building

Run:

```bash
nx package providers-flagsmith
```

to build the library.

## Running unit tests

Run:

```bash
npx nx run providers-flagsmith:test
```

to execute the unit tests via [Jest](https://jestjs.io).

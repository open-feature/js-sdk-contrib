# Server-side GO Feature Flag Provider

A feature flag provider for [OpenFeature](https://openfeature.dev/) that integrates with [go-feature-flag](https://github.com/thomaspoignant/go-feature-flag), a simple and complete feature flag solution.

This provider supports both **in-process** and **remote** evaluation modes, offering flexibility for different deployment scenarios.

## Features 🚀

- **Dual Evaluation Modes**: In-process evaluation for performance and remote evaluation for centralized control
- **Real-time Configuration Updates**: Automatic polling for flag configuration changes
- **Comprehensive Data Collection**: Built-in event tracking and analytics
- **Flexible Context Support**: Rich evaluation context with targeting rules
- **Remote Fallback**: In-process evaluation falls back to the relay proxy when the local engine cannot answer
- **TypeScript Support**: Full TypeScript support with type safety

## Specification 📋

This provider targets **GO Feature Flag Provider Specification 1.0**, and evaluates in-process with
**WASM evaluation module `0.2.4`** (embedding engine `modules/core v0.7.2`). The pinned module
version lives in `scripts/copy-latest-wasm.js`.

## Installation 📦

```bash
npm install @openfeature/go-feature-flag-provider
```

### Peer Dependencies

```bash
npm install @openfeature/server-sdk
```

## Quick Start 🏃‍♂️

### Basic Setup

```typescript
import { OpenFeature } from '@openfeature/server-sdk';
import { GoFeatureFlagProvider, EvaluationType } from '@openfeature/go-feature-flag-provider';

// Initialize the provider
const provider = new GoFeatureFlagProvider({
  endpoint: 'https://your-relay-proxy.com',
  evaluationType: EvaluationType.Remote,
});

// Register the provider
OpenFeature.setProvider(provider);

// Get a client
const client = OpenFeature.getClient();

// Evaluate a flag
const flagValue = await client.getBooleanValue('my-feature-flag', false, {
  targetingKey: 'user-123',
  email: 'user@example.com',
});
```

### In-Process Evaluation

For high-performance scenarios where you want to evaluate flags locally:

```typescript
import { GoFeatureFlagProvider, EvaluationType } from '@openfeature/go-feature-flag-provider';

const provider = new GoFeatureFlagProvider({
  endpoint: 'https://your-relay-proxy.com',
  evaluationType: EvaluationType.InProcess,
  flagChangePollingIntervalMs: 30000, // Poll every 30 seconds
});
```

## Configuration Options ⚙️

### Provider Options

| Option                        | Type                     | Default      | Description                                                                                                                             |
| ----------------------------- | ------------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `endpoint`                    | `string`                 | **Required** | The endpoint of the GO Feature Flag relay-proxy                                                                                         |
| `evaluationType`              | `EvaluationType`         | `InProcess`  | Evaluation mode: `InProcess` or `Remote`                                                                                                |
| `timeout`                     | `number`                 | `10000`      | HTTP request timeout in milliseconds                                                                                                    |
| `flagChangePollingIntervalMs` | `number`                 | `120000`     | Polling interval for configuration changes. Each delay is jittered by ±10% so that a fleet restarted together does not poll in lockstep |
| `dataFlushInterval`           | `number`                 | `60000`      | Data collection flush interval                                                                                                          |
| `maxPendingEvents`            | `number`                 | `10000`      | Maximum pending events before flushing                                                                                                  |
| `disableDataCollection`       | `boolean`                | `false`      | Disable data collection entirely                                                                                                        |
| `apiKey`                      | `string`                 | `undefined`  | API key for authentication                                                                                                              |
| `exporterMetadata`            | `ExporterMetadata`       | `undefined`  | Custom metadata for events                                                                                                              |
| `fetchImplementation`         | `FetchAPI`               | `undefined`  | Custom fetch implementation                                                                                                             |
| `headers`                     | `Record<string, string>` | `undefined`  | Extra headers on every relay-proxy request, in both modes                                                                               |
| `dataCollectorBaseURL`        | `string`                 | `endpoint`   | Base URL for the data collector, when served separately from the relay proxy                                                            |
| `evaluationFlagList`          | `string[]`               | all flags    | Restrict the retrieved configuration to these flags _(in-process mode only)_                                                            |
| `wasmBinaryPath`              | `string`                 | `undefined`  | Custom path to the WASM binary file _(in-process mode only)_.                                                                           |

### Authentication

When `apiKey` is set, the provider sends it as **`X-API-Key`** on every call to the relay proxy —
flag configuration, remote evaluation and data collection alike. When it is unset or empty, no
authentication header is sent at all.

Use `headers` for a relay proxy behind an API gateway that needs its own credentials. Those headers
are sent on every request in both evaluation modes. `Content-Type` and `If-None-Match` are transport
details owned by the provider and a value supplied under either name is ignored, whatever its
casing.

`X-API-Key` is ignored there only while `apiKey` is set — that option is the supported way to
authenticate, and it wins. With no `apiKey` configured you may supply one through `headers` instead.

```ts
new GoFeatureFlagProvider({
  endpoint: 'https://relay.example.com',
  apiKey: 'my-relay-proxy-key',
  headers: { 'X-Api-Gateway-Key': 'my-gateway-secret' },
});
```

### Evaluation Types

#### InProcess Evaluation

- **Performance**: Fastest evaluation — flags are evaluated locally, against the configuration held in memory
- **Network**: Minimal network calls, only for configuration polling, data collection, and the fallback below
- **Use Case**: High-performance applications, real-time evaluation

#### Remote Evaluation

- **Performance**: Network-dependent evaluation
- **Network**: Each evaluation requires a network call, works well with side-cars or in the edge
- **Use Case**: Centralized control

#### Remote Fallback

When in-process evaluation cannot produce a result — the local engine reports a parse or general
error — the provider evaluates that single flag against the relay proxy instead of returning an
error to the caller, using the same endpoint, credentials and timeout. Flags resolved this way carry
`gofeatureflag_evaluated_remotely: true` in their metadata and are excluded from data collection, so
the relay proxy records them once rather than twice.

### Provider Events

Both evaluation modes report health through the OpenFeature event emitter, each signalling the
condition its mode can reach:

| Mode       | Event                            | When                                                                               |
| ---------- | -------------------------------- | ---------------------------------------------------------------------------------- |
| In-process | `PROVIDER_CONFIGURATION_CHANGED` | A poll returns a configuration whose content differs; names the flags that changed |
| In-process | `PROVIDER_STALE`                 | Three consecutive polls fail. The last known-good configuration keeps being served |
| In-process | `PROVIDER_READY`                 | A poll succeeds after the provider went stale                                      |
| Remote     | `PROVIDER_ERROR`                 | The relay proxy could not answer an evaluation. Reported on the first failure      |
| Remote     | `PROVIDER_READY`                 | An evaluation succeeds again                                                       |

Remote mode holds no configuration of its own, so it emits neither `PROVIDER_CONFIGURATION_CHANGED`
— there is nothing cached to change — nor `PROVIDER_STALE`, which describes a last known-good
snapshot ageing. A relay proxy it cannot reach means it cannot evaluate at all, which is why the
first failure is reported immediately rather than after a threshold. Both states are recoverable:
evaluations keep reaching the provider and the next success restores `PROVIDER_READY`.

## Advanced Usage 🔧

### Custom Context and Targeting

```typescript
const context = {
  targetingKey: 'user-123',
  email: 'john.doe@example.com',
  firstname: 'John',
  lastname: 'Doe',
  anonymous: false,
  professional: true,
  rate: 3.14,
  age: 30,
  company_info: {
    name: 'my_company',
    size: 120,
  },
  labels: ['pro', 'beta'],
};

const flagValue = await client.getBooleanValue('my-feature-flag', false, context);
```

### Data Collection and Analytics

The provider automatically collects evaluation data. You can customize this behavior:

```typescript
const provider = new GoFeatureFlagProvider({
  endpoint: 'https://your-relay-proxy.com',
  evaluationType: EvaluationType.Remote,
  disableDataCollection: false, // Enable data collection
  dataFlushInterval: 20000, // Flush every 20 seconds
  maxPendingEvents: 5000, // Max 5000 pending events
});
```

### Custom WASM Binary Path

When using in-process evaluation, you can specify a custom path for the WASM binary file. This is useful when the WASM file is bundled in a custom location:

```typescript
const provider = new GoFeatureFlagProvider({
  endpoint: 'https://your-relay-proxy.com',
  evaluationType: EvaluationType.InProcess,
  wasmBinaryPath: '/path/to/custom/gofeatureflag-evaluation.wasm',
});
```

### Custom Exporter Metadata

Add custom metadata to your evaluation events:

```typescript
import { ExporterMetadata } from '@openfeature/go-feature-flag-provider';

const metadata = new ExporterMetadata()
  .add('environment', 'production')
  .add('version', '1.0.0')
  .add('region', 'us-east-1');

const provider = new GoFeatureFlagProvider({
  endpoint: 'https://your-relay-proxy.com',
  evaluationType: EvaluationType.Remote,
  exporterMetadata: metadata,
});
```

The metadata is a **flat JSON object**: values are a string, a boolean, or a number — integers and
floats alike. Anything that would nest it or that JSON cannot render — an object, an array, `null`,
`NaN`, `Infinity` — throws `InvalidOptionsException` from `add`, rather than reaching the collector
as a value it cannot store.

`provider` and `openfeature` are reserved: they are always present and a value supplied for either is
ignored, so events stay attributable to this SDK and language.

## Flag Types Supported 🎯

The provider supports all OpenFeature flag types:

### Boolean Flags

```typescript
const isEnabled = await client.getBooleanValue('feature-flag', false, context);
const details = await client.getBooleanDetails('feature-flag', false, context);
```

### String Flags

```typescript
const message = await client.getStringValue('welcome-message', 'Hello!', context);
const details = await client.getStringDetails('welcome-message', 'Hello!', context);
```

### Number Flags

```typescript
const percentage = await client.getNumberValue('discount-percentage', 0, context);
const details = await client.getNumberDetails('discount-percentage', 0, context);
```

### Object Flags

```typescript
const config = await client.getObjectValue('user-config', {}, context);
const details = await client.getObjectDetails('user-config', {}, context);
```

## Tracking Events 📊

The provider supports custom event tracking:

```typescript
// Track a custom event
client.track('user_action', context, {
  action: 'button_click',
  page: 'homepage',
  timestamp: Date.now(),
});
```

## Contributing 🤝

We welcome contributions! Please see our [contributing guidelines](CONTRIBUTING.md) for details.

## License 📄

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## Support 💬

- **Documentation**: [GO Feature Flag Documentation](https://gofeatureflag.org/), [OpenFeature Documentation](https://openfeature.dev/)
- **Issues**: [GitHub Issues](https://github.com/thomaspoignant/go-feature-flag/issues)

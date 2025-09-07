# Server-side GO Feature Flag Provider

A feature flag provider for [OpenFeature](https://openfeature.dev/) that integrates with [go-feature-flag](https://github.com/thomaspoignant/go-feature-flag), a simple and complete feature flag solution.

This provider supports both **in-process** and **remote** evaluation modes, offering flexibility for different deployment scenarios.

## Features 🚀

- **Dual Evaluation Modes**: In-process evaluation for performance and remote evaluation for centralized control
- **Real-time Configuration Updates**: Automatic polling for flag configuration changes
- **Comprehensive Data Collection**: Built-in event tracking and analytics
- **Flexible Context Support**: Rich evaluation context with targeting rules
- **Caching**: Intelligent caching with automatic cache invalidation
- **Error Handling**: Robust error handling with fallback mechanisms
- **TypeScript Support**: Full TypeScript support with type safety
- **OpenFeature Compliance**: Full compliance with OpenFeature specification

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

| Option                        | Type               | Default      | Description                                     |
| ----------------------------- | ------------------ | ------------ | ----------------------------------------------- |
| `endpoint`                    | `string`           | **Required** | The endpoint of the GO Feature Flag relay-proxy |
| `evaluationType`              | `EvaluationType`   | `InProcess`  | Evaluation mode: `InProcess` or `Remote`        |
| `timeout`                     | `number`           | `10000`      | HTTP request timeout in milliseconds            |
| `flagChangePollingIntervalMs` | `number`           | `120000`     | Polling interval for configuration changes      |
| `dataFlushInterval`           | `number`           | `120000`     | Data collection flush interval                  |
| `maxPendingEvents`            | `number`           | `10000`      | Maximum pending events before flushing          |
| `disableDataCollection`       | `boolean`          | `false`      | Disable data collection entirely                |
| `apiKey`                      | `string`           | `undefined`  | API key for authentication                      |
| `exporterMetadata`            | `ExporterMetadata` | `undefined`  | Custom metadata for events                      |
| `fetchImplementation`         | `FetchAPI`         | `undefined`  | Custom fetch implementation                     |

### Evaluation Types

#### InProcess Evaluation

- **Performance**: Fastest evaluation with local caching
- **Network**: Minimal network calls, only for configuration updates and tracking
- **Use Case**: High-performance applications, real-time evaluation

#### Remote Evaluation

- **Performance**: Network-dependent evaluation
- **Network**: Each evaluation requires a network call, works well with side-cars or in the edge
- **Use Case**: Centralized control

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

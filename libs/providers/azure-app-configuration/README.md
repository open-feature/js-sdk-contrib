# Azure App Configuration Provider

## What is Azure App Configuration?

[Azure App Configuration](https://learn.microsoft.com/azure/azure-app-configuration/overview) is a managed service that provides a central place to manage application settings and feature flags. Its feature management capabilities support simple on/off toggles as well as advanced scenarios such as targeting, time windows, percentage rollouts, and variant feature flags.

This provider lets OpenFeature applications resolve feature flags stored in Azure App Configuration. Under the hood it uses the official [`@azure/app-configuration-provider`](https://www.npmjs.com/package/@azure/app-configuration-provider) to load and refresh feature flags, and [`@microsoft/feature-management`](https://www.npmjs.com/package/@microsoft/feature-management) to evaluate them.

## Installation

```
$ npm install @openfeature/azure-app-configuration-provider @azure/identity
```

`@openfeature/server-sdk` and `@azure/identity` are peer dependencies. Install `@azure/identity` if you authenticate with a token credential (recommended). It is not required when authenticating with a connection string.

## Usage

The provider is a server-side provider. Register it with OpenFeature and wait for it to become ready.

### Using a Microsoft Entra ID token credential (recommended)

```typescript
import { OpenFeature } from '@openfeature/server-sdk';
import { AzureAppConfigurationProvider } from '@openfeature/azure-app-configuration-provider';
import { DefaultAzureCredential } from '@azure/identity';

const provider = new AzureAppConfigurationProvider({
  endpoint: 'https://<your-store>.azconfig.io',
  credential: new DefaultAzureCredential(),
});

await OpenFeature.setProviderAndWait(provider);

const client = OpenFeature.getClient();
const isEnabled = await client.getBooleanValue('Beta', false);
```

### Using a connection string

```typescript
import { OpenFeature } from '@openfeature/server-sdk';
import { AzureAppConfigurationProvider } from '@openfeature/azure-app-configuration-provider';

const provider = new AzureAppConfigurationProvider({
  connectionString: process.env.AZURE_APPCONFIG_CONNECTION_STRING!,
});

await OpenFeature.setProviderAndWait(provider);
```

## Configuration

Provide exactly one of `connectionString` or `endpoint` + `credential`.

| Property              | Type                | Description                                                                                                     | Default                |
| --------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `connectionString`    | `string`            | Connection string for the Azure App Configuration store. Mutually exclusive with `endpoint`/`credential`.       | —                      |
| `endpoint`            | `string`            | Endpoint URL of the Azure App Configuration store. Requires `credential`.                                       | —                      |
| `credential`          | `TokenCredential`   | Token credential (e.g. `DefaultAzureCredential`) used with `endpoint`.                                          | —                      |
| `selectors`           | `SettingSelector[]` | Feature flag selectors (`keyFilter`, `labelFilter`, ...) used to filter which feature flags are loaded.         | `[{ keyFilter: '*' }]` |
| `enableRefresh`       | `boolean`           | Whether to periodically refresh feature flags and emit `ConfigurationChanged` events when a change is detected. | `true`                 |
| `refreshIntervalInMs` | `number`            | Polling interval (in milliseconds) used to refresh feature flags. Must be greater than 1000.                    | `30000`                |

## Flag resolution semantics

Azure App Configuration feature flags map onto OpenFeature evaluation methods as follows:

- **Boolean** (`getBooleanValue`): resolves the feature flag's enabled state via `FeatureManager.isEnabled`. This honors any configured feature filters (targeting, time window, percentage rollout, etc.).
- **String / Number / Object** (`getStringValue`, `getNumberValue`, `getObjectValue`): resolve [variant feature flags](https://learn.microsoft.com/azure/azure-app-configuration/howto-variant-feature-flags-javascript) via `FeatureManager.getVariant`. The variant's `configuration` value is returned, and the variant name is exposed as the resolution `variant`. If no variant is assigned, the provided default value is returned with reason `DEFAULT`. A `TypeMismatchError` is raised if the variant configuration does not match the requested type.

### Targeting context

The OpenFeature evaluation context is mapped to the Azure feature-management targeting context:

- `targetingKey` maps to `userId`.
- a `groups` attribute (array of strings) maps to `groups`.

```typescript
const variant = await client.getStringValue('Greeting', 'Hello', {
  targetingKey: 'user-123',
  groups: ['beta-testers'],
});
```

## Events

When `enableRefresh` is `true`, the provider polls Azure App Configuration on `refreshIntervalInMs` and emits `ProviderEvents.ConfigurationChanged` whenever a refresh detects a change to the selected feature flags.

## Building

Run `nx package azure-app-configuration` to build the library.

## Running unit tests

Run `nx test azure-app-configuration` to execute the unit tests via [Jest](https://jestjs.io).

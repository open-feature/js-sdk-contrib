# ConfigCat Provider

This is an OpenFeature provider implementation for using [ConfigCat](https://configcat.com), a managed feature flag service in Node.js applications.

## Installation

```
$ npm install @openfeature/config-cat-provider
```

#### Required peer dependencies

The OpenFeature SDK is required as peer dependency.

The minimum required version of `@openfeature/server-sdk` currently is `1.13.5`.

The minimum required version of `configcat-node` currently is `11.0.0`.

```
$ npm install @openfeature/server-sdk configcat-node
```

## Usage

The ConfigCat provider uses the [ConfigCat Node.js SDK](https://configcat.com/docs/sdk-reference/node/).

It can be created by passing the ConfigCat SDK options to ```ConfigCatProvider.create```.

The available options can be found in the [ConfigCat Node.js SDK](https://configcat.com/docs/sdk-reference/node/#creating-the-configcat-client).

### Example using the default configuration

```javascript
import { OpenFeature } from "@openfeature/server-sdk";
import { ConfigCatProvider } from '@openfeature/config-cat-provider';

// Create and set the provider.
const provider = ConfigCatProvider.create('<sdk_key>');
await OpenFeature.setProviderAndWait(provider);

// Obtain a client instance and evaluate feature flags.
const client = OpenFeature.getClient();

const value = await client.getBooleanValue('isAwesomeFeatureEnabled', false);
console.log(`isAwesomeFeatureEnabled: ${value}`);

// On application shutdown, clean up the OpenFeature provider and the underlying ConfigCat client.
await OpenFeature.clearProviders();
```

### Example using a different polling mode and custom configuration

```javascript
import { OpenFeature } from "@openfeature/server-sdk";
import { ConfigCatProvider } from '@openfeature/config-cat-provider';
import { createConsoleLogger, LogLevel, PollingMode } from 'configcat-node';

// Create and set the provider.
const provider = ConfigCatProvider.create('<sdk_key>', PollingMode.LazyLoad, {
  logger: createConsoleLogger(LogLevel.Info),
  setupHooks: (hooks) => hooks.on('clientReady', () => console.log('Client is ready!')),
});
await OpenFeature.setProviderAndWait(provider);

// ...
```

## Evaluation Context

The OpenFeature Evaluation Context is mapped to the [ConfigCat User Object](https://configcat.com/docs/advanced/user-object/).

The [ConfigCat User Object](https://configcat.com/docs/advanced/user-object/) has three predefined attributes,
and allows for additional attributes.
The following shows how the attributes are mapped:

| OpenFeature EvaluationContext Field | ConfigCat User Field | Required |
|-------------------------------------|----------------------|----------|
| targetingKey                        | identifier           | yes      |
| email                               | email                | no       |
| country                             | country              | no       |
| _Any Other_                         | custom               | no       |

The custom types are mapped the following way:

| OpenFeature EvaluationContext Field Type      | ConfigCat User Field Type |
|-----------------------------------------------|---------------------------|
| string                                        | string                    |
| number                                        | number                    |
| boolean                                       | string                    |
| Array<string>                                 | Array<string>             |
| Array                                         | Array                     |
| object                                        | string                    |

The following example shows the conversion between an OpenFeature Evaluation Context and the corresponding ConfigCat
User:

#### OpenFeature

```json
{
  "targetingKey": "test",
  "email": "email",
  "country": "country",
  "customString": "customString",
  "customNumber": 1,
  "customBoolean": true,
  "customObject": {
    "prop1": "1",
    "prop2": 2
  },
  "customStringArray": ["one", "two"],
  "customArray": [
    1,
    "2",
    false
  ]
}
```

#### ConfigCat

```json
{
  "identifier": "test",
  "email": "email",
  "country": "country",
  "custom": {
    "customString": "customString",
    "customBoolean": "true",
    "customNumber": 1,
    "customObject": "{\"prop1\":\"1\",\"prop2\":2}",
    "customStringArray": ["one", "two"],
    "customArray": "[1,\"2\",false]"
  }
}
```

## Events

The ConfigCat provider emits the
following [OpenFeature events](https://openfeature.dev/specification/types#provider-events):

- PROVIDER_READY
- PROVIDER_ERROR
- PROVIDER_CONFIGURATION_CHANGED

## Building

Run `nx package providers-config-cat` to build the library.

## Running unit tests

Run `nx test providers-config-cat` to execute the unit tests via [Jest](https://jestjs.io).

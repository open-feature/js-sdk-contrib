# ConfigCat Web Provider

This is an OpenFeature provider implementation for using [ConfigCat](https://configcat.com), a managed feature flag service in JavaScript frontend applications.

## Installation

```
$ npm install @openfeature/config-cat-web-provider
```

#### Required peer dependencies

The OpenFeature SDK is required as peer dependency.

The minimum required version of `@openfeature/web-sdk` currently is `1.0.0`.

The minimum required version of `@configcat/sdk` currently is `1.0.1`.

```
$ npm install @openfeature/web-sdk @configcat/sdk
```

## Usage

The ConfigCat provider uses the [ConfigCat Browser (JavaScript) SDK](https://configcat.com/docs/sdk-reference/js/browser/).

It can be created by passing the ConfigCat SDK options to ```ConfigCatWebProvider.create```.
The available options can be found in the [ConfigCat JavaScript SSR SDK](https://configcat.com/docs/sdk-reference/js/browser/#creating-the-configcat-client).

The ConfigCat Web Provider only supports the `AutoPolling` mode because it caches all evaluation data to support synchronous evaluation of feature flags.

### Example using the default configuration

```javascript
import { OpenFeature } from "@openfeature/web-sdk";
import { ConfigCatWebProvider } from '@openfeature/config-cat-web-provider';

// Create and set the provider.
const provider = ConfigCatWebProvider.create('<sdk_key>');
await OpenFeature.setProviderAndWait(provider);

// Create a client instance to evaluate feature flags.
const client = OpenFeature.getClient();

const value = await client.getBooleanValue('isAwesomeFeatureEnabled', false);
console.log(`isAwesomeFeatureEnabled: ${value}`);

// On application shutdown, clean up the OpenFeature provider and the underlying ConfigCat client.
await OpenFeature.clearProviders();
```

### Example using custom configuration

```javascript
import { OpenFeature } from "@openfeature/web-sdk";
import { ConfigCatWebProvider } from '@openfeature/config-cat-web-provider';
import { createConsoleLogger, LogLevel } from '@configcat/sdk';

// Create and set the provider.
const provider = ConfigCatWebProvider.create('<sdk_key>', {
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

| OpenFeature EvaluationContext Field Type | ConfigCat User Field Type |
|------------------------------------------|---------------------------|
| string                                   | string                    |
| number                                   | number                    |
| boolean                                  | string                    |
| Array<string>                            | Array<string>             |
| Array                                    | Array                     |
| object                                   | string                    |

The following example shows the conversion between an OpenFeature Evaluation Context and the corresponding ConfigCat
User:

#### OpenFeature

```json
{
  "targetingKey": "userId",
  "email": "email",
  "country": "country",
  "customString": "customString",
  "customNumber": 1,
  "customBoolean": true,
  "customObject": {
    "prop1": "1",
    "prop2": 2
  },
  "customStringArray": [
    "one",
    "two"
  ],
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
  "identifier": "userId",
  "email": "email",
  "country": "country",
  "custom": {
    "targetingKey": "userId",
    "customString": "customString",
    "customBoolean": "true",
    "customNumber": 1,
    "customObject": "{\"prop1\":\"1\",\"prop2\":2}",
    "customStringArray": [
      "one",
      "two"
    ],
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

Run `nx package providers-config-cat-web` to build the library.

## Running unit tests

Run `nx test providers-config-cat-web` to execute the unit tests via [Jest](https://jestjs.io).

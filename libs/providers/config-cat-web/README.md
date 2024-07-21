# ConfigCat Web Provider

This provider is an implementation for [ConfigCat](https://configcat.com) a managed feature flag service.

## Installation

```
$ npm install @openfeature/config-cat-web-provider
```

#### Required peer dependencies

The OpenFeature SDK is required as peer dependency.

The minimum required version of `@openfeature/web-sdk` currently is `1.0.0`.

The minimum required version of `configcat-js-ssr` currently is `7.1.2`.

```
$ npm install @openfeature/client-sdk configcat-js-ssr
```

## Usage

The ConfigCat provider uses the [ConfigCat JavaScript SSR SDK](https://configcat.com/docs/sdk-reference/js-ssr/).

It can be created by passing the ConfigCat SDK options to ```ConfigCatProvider.create```.
The available options can be found in the [ConfigCat JavaScript SSR SDK](https://configcat.com/docs/sdk-reference/js-ssr/).

The ConfigCat Web Provider only supports the `AutoPolling` mode because it caches all evaluation data to support synchronous evaluation of feature flags.

### Example using the default configuration

```javascript
import { ConfigCatProvider } from '@openfeature/config-cat-web-provider';

const provider = ConfigCatProvider.create('<sdk_key>');
OpenFeature.setProvider(provider);
```

### Example using different polling options and a setupHook

```javascript
import { ConfigCatProvider } from '@openfeature/config-cat-web-provider';

const provider = ConfigCatProvider.create('<sdk_key>', {
  setupHooks: (hooks) => hooks.on('clientReady', () => console.log('Client is ready!')),
});

OpenFeature.setProvider(provider);
```

## Evaluation Context

The OpenFeature Evaluation Context is mapped to the [ConfigCat user object](https://configcat.com/docs/advanced/user-object/).

The [ConfigCat user object](https://configcat.com/docs/advanced/user-object/) has three known attributes,
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
  "identifier": "test",
  "email": "email",
  "country": "country",
  "custom": {
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

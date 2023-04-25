# ConfigCat Provider

This provider is an implementation for [ConfigCat](https://configcat.com) a managed feature flag service.

## Installation

```
$ npm install @openfeature/config-cat-provider
```

## Usage

The ConfigCat provider uses the [ConfigCat Javascript SDK](https://configcat.com/docs/sdk-reference/js/).

It can either be created by passing the ConfigCat SDK options to ```ConfigCatProvider.create``` or injecting a ConfigCat
SDK client into ```ConfigCatProvider.createFromClient```.

The available options can be found in the [ConfigCat Javascript SDK docs](https://configcat.com/docs/sdk-reference/js/).

### Example using the default configuration

```javascript
import { ConfigCatProvider } from '@openfeature/config-cat-provider';

const provider = OpenFeature.setProvider(ConfigCatProvider.create('<sdk_key>'));
OpenFeature.setProvider(provider);
```

### Example using different polling options and a setupHook

```javascript
import { ConfigCatProvider } from '@openfeature/config-cat-provider';

const provider = ConfigCatProvider.create('<sdk_key>', PollingMode.LazyLoad, {
  setupHooks: (hooks) => hooks.on('clientReady', () => console.log('Client is ready!')),
});

OpenFeature.setProvider(provider);
```

### Example injecting a client

```javascript
import { ConfigCatProvider } from '@openfeature/config-cat-provider';
import * as configcat from 'configcat-js';

const configCatClient = configcat.getClient("<sdk_key>")
const provider = ConfigCatProvider.createFromClient(configCatClient);

OpenFeature.setProvider(provider);
```

## Evaluation Context

ConfigCat only supports string values in its "evaluation
context", [there known as user](https://configcat.com/docs/advanced/user-object/).

This means that every value is converted to a string. This is trivial for numbers and booleans. Objects and arrays are
converted to JSON strings that can be interpreted in ConfigCat.

ConfigCat has three known attributes, and allows for additional attributes.
The following shows how the attributes are mapped:

| OpenFeature EvaluationContext Field | ConfigCat User Field | Required |
|-------------------------------------|----------------------|----------|
| targetingKey                        | identifier           | yes      |
| email                               | email                | no       |
| country                             | country              | no       |
| _Any Other_                         | custom               | no       |

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
    "customNumber": "1",
    "customObject": "{\"prop1\":\"1\",\"prop2\":2}",
    "customArray": "[1,\"2\",false]"
  }
}
```

## Building

Run `nx package providers-config-cat` to build the library.

## Running unit tests

Run `nx test providers-config-cat` to execute the unit tests via [Jest](https://jestjs.io).

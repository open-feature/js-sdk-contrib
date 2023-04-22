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

## Building

Run `nx package providers-config-cat` to build the library.

## Running unit tests

Run `nx test providers-config-cat` to execute the unit tests via [Jest](https://jestjs.io).

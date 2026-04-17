# LocalStorage Provider

The `localStorage` provider is a great provider to use combined with other providers to allow for local overrides of feature flags.
It doesn't require any infrastructure to setup or manage, and provides a simple way to allow anyone with access to the browser's developer tools to change the values of feature flags for their own experience.
This could be useful for testing or debugging purposes, or as part of a minimal hidden UI in your application to allow developers, product managers, or anyone else, to self-serve their own access to features in development.

## Installation

```
$ npm install @openfeature/localstorage-provider
```

Required peer dependencies

```
$ npm install @openfeature/web-sdk
```

## Usage

The `localStorage` provider uses the browser's `localStorage` to determine the value of a feature flag.
It supports `booleans`, `strings`, `numbers` and `objects` by attempting to interpret the value of a `localStorage` entry to the requested type.
The default value will be returned if there is no matching `localStorage` entry or the value can't be cast to the desired type.

```typescript
import { OpenFeature, MultiProvider } from '@openfeature/web-sdk';
import { LocalStorageProvider } from '@openfeature/localstorage-provider';

// Register the localStorage provider globally, using MultiProvider to allow it to override flag resolutions from other providers
OpenFeature.setProvider(
  new MultiProvider([{ provider: new LocalStorageProvider() }, { provider: new OtherProvider() }]),
);
```

### Available options

| Option name | Type   | Default        |
| ----------- | ------ | -------------- |
| prefix      | string | 'openfeature.' |

Use the `prefix` option to specify a custom prefix for `localStorage` entries.
By default, the provider will look for entries that start with `openfeature.`, followed by the flag key.
For example, if you have a flag with the key `new-feature`, the provider will look for a `localStorage` entry with the key `openfeature.new-feature` to determine the value of that flag.
This allows you to define feature flags in `localStorage` without worrying about naming collisions with other data stored there.

## Examples

### Boolean example

```javascript
// In the browser's developer console set a localStorage entry for the flag
localStorage.setItem('openfeature.enable-new-feature', 'true');
```

```typescript
const client = OpenFeature.getClient();
client.getBooleanValue('enable-new-feature', false);
```

### Number example

```javascript
// In the browser's developer console set a localStorage entry for the flag
localStorage.setItem('openfeature.difficulty-multiplier', '5');
```

```typescript
const client = OpenFeature.getClient();
client.getNumberValue('difficulty-multiplier', 0);
```

### String example

```javascript
// In the browser's developer console set a localStorage entry for the flag
localStorage.setItem('openfeature.welcome-message', 'yo');
```

```typescript
const client = OpenFeature.getClient();
client.getStringValue('welcome-message', 'hi');
```

### Object example

```javascript
// In the browser's developer console set a localStorage entry for the flag
localStorage.setItem('openfeature.preferred-sdk', '{"name": "openfeature"}');
```

```typescript
const client = OpenFeature.getClient();
client.getObjectValue('preferred-sdk', { name: 'OpenFeature' });
```

## Development

### Building

Run `nx package providers-localstorage` to build the library.

### Running unit tests

Run `nx test providers-localstorage` to execute the unit tests via [Jest](https://jestjs.io).

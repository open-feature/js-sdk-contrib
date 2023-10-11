# Environment Variable Provider

The environment variable provider is a great way to start using OpenFeature.
It doesn't require any infrastructure to setup or manage, and provides a simple way to gain experience with the core concepts of feature flagging.
However, it doesn't support features such as dynamic updates at run-time or contextual flag evaluation.
That's where feature flags become extremely powerful!
Thankfully, the OpenFeature SDK supports basic providers such at this one, while making it simple to switch to a more powerful system when the time is right.

## Installation

```
$ npm install @openfeature/env-var-provider
```

Required peer dependencies

```
$ npm install @openfeature/server-sdk
```

## Usage

The environment variable provider uses environment variables to determine the value of a feature flag.
It supports `booleans`, `strings`, `numbers` and `objects` by attempting to interpret the value of an environment variable to the requested type.
The default value will be returned if the environment variable doesn't exist or the value can't be cast to the desired type.

```typescript
// Register the environment variable provider globally
OpenFeature.setProvider(new EnvVarProvider());
```

### Available options

| Option name         | Type    | Default |
| ------------------- | ------- | ------- |
| disableConstantCase | boolean | false   |

## Examples

### Boolean example

```sh
# Start a hypothetical application with the ENABLE_NEW_FEATURE environment variable
ENABLE_NEW_FEATURE=true node my-app.js
```

```typescript
const client = OpenFeature.getClient();
client.getBooleanValue('enable-new-feature', false);
```

### Number example

```sh
# Start a hypothetical application with the DIFFICULTY_MULTIPLIER environment variable
DIFFICULTY_MULTIPLIER=5 node my-app.js
```

```typescript
const client = OpenFeature.getClient();
client.getNumberValue('difficulty-multiplier', 0);
```

### String example

```sh
# Start a hypothetical application with the WELCOME_MESSAGE environment variable
WELCOME_MESSAGE=yo node my-app.js
```

```typescript
const client = OpenFeature.getClient();
client.getStringValue('welcome-message', 'hi');
```

### Object example

```sh
# Start a hypothetical application with the PREFERRED_SDK environment variable
PREFERRED_SDK='{"name": "openfeature"}' node my-app.js
```

```typescript
const client = OpenFeature.getClient();
client.getObjectValue('preferred-sdk', { name: 'OpenFeature' });
```

## Development

### Building

Run `nx package providers-env-var` to build the library.

### Running unit tests

Run `nx test providers-env-var` to execute the unit tests via [Jest](https://jestjs.io).

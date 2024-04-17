# Flipt Provider

[Flipt](https://www.flipt.io/) is an open source developer friendly feature flagging solution, that allows for easy management and fast feature evaluation.

This provider is an implementation on top of the official [Flipt Node Server Side SDK](https://www.npmjs.com/package/@flipt-io/flipt).

## Installation

```
$ npm install @openfeature/flipt-provider
```

### Peer Dependencies

Both the OpenFeature SDK and the Flipt Node Server SDK are required as peer dependencies.

Please make sure to install `@flipt/flipt-io` at versions >= `1.0.0`, as the client API is different in earlier versions.

The peer dependency will also enforce the above version.

## Example initialization and usage

To initialize the OpenFeature client with Flipt, you can use the following code snippet:

```ts
import { FliptProvider } from '@openfeature/flipt';

const provider = new FliptProvider('namespace-of-choice', { url: 'http://your.upstream.flipt.host' });
OpenFeature.setProvider(provider);
```

After the provider gets initialized, you can start evaluations of feature flags like so:

```ts
const client = OpenFeature.getClient();
const details = await client.getStringDetails('nonExistent', 'default', {
  targetingKey: 'myentity',
  email: 'john@flipt.io',
});
```

## Evaluation Context Transformation

OpenFeature standardizes the evaluation context to include a `targetingKey`, and some other additional arbitrary properties that each provider can use fit for their use case.

For Flipt, we translate the `targetingKey` as the `entityId`, and the rest of the OpenFeature evaluation context as the `context` in Flipt vernacular. You can find the meaning of those two words [here](https://www.flipt.io/docs/reference/evaluation/variant-evaluation) in our API docs.

For example, an OpenFeature Evaluation context that has this structure:

```json
{
  "targetingKey": "my-targeting-id",
  "email": "john@flipt.io",
  "userId": "this-very-long-user-id"
}
```

will get transformed to the following for Flipt:

```json
{
  "entityId": "my-targeting-id",
  "context": {
    "email": "john@flipt.io",
    "userId": "this-very-long-user-id"
  }
}
```

## Building

Run `nx package providers-flipt` to build the library.

## Running unit tests

Run `nx test providers-flipt` to execute the unit tests via [Jest](https://jestjs.io).

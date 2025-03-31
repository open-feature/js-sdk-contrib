# Flipt Web Provider

[Flipt](https://www.flipt.io/) is an open source developer friendly feature flagging solution, that allows for easy management and fast feature evaluation.

This provider is an implementation on top of the official [Flipt JavaScript Client Side SDK](https://www.npmjs.com/package/@flipt-io/flipt-client-js).

The main difference between this provider and [`@openfeature/flipt-provider`](https://www.npmjs.com/package/@openfeature/flipt-provider) is that it uses a **static evaluation context**.  
This provider is more sustainable for client-side implementation.

If you want to know more about this pattern, we encourage you to read this [blog post](https://openfeature.dev/blog/catering-to-the-client-side/).

## Installation

```
npm install @openfeature/web-sdk @openfeature/flipt-web-provider
```

## Usage

To initialize the OpenFeature client with Flipt, you can use the following code snippet:

```ts
import { FliptWebProvider } from '@openfeature/flipt-web-provider';

const provider = new FliptWebProvider('namespace-of-choice', { url: 'http://your.upstream.flipt.host' });
await OpenFeature.setProviderAndWait(provider);
```

After the provider gets initialized, you can start evaluations of feature flags like so:

```ts
const evaluationCtx: EvaluationContext = {
  targetingKey: 'myentity',
  email: 'john@flipt.io',
};

// Set the static context for OpenFeature
await OpenFeature.setContext(evaluationCtx);

// Attach the provider to OpenFeature
const client = await OpenFeature.getClient();

// You can now use the client to evaluate your flags
const details = client.getStringDetails('my-feature', 'default');
```

### Available Options

You can pass the following options to the `FliptWebProvider` constructor:

| Option name    | Type   | Default                 | Description                                                                                                                                                                               |
| -------------- | ------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| url            | string | <http://localhost:8080> | URL where your Flipt server is located.                                                                                                                                                   |
| authentication | object |                         | (optional) If Flipt is configured to authenticate the requests, you should provide an `authentication` object to the provider. See: [`FliptWebProviderAuthentication`](src/lib/models.ts) |

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

Run `nx package providers-flipt-web` to build the library.

## Running unit tests

Run `nx test providers-flipt-web` to execute the unit tests via [Jest](https://jestjs.io).

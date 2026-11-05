# Optimizely Provider

Use this provider to evaluate Optimizely Feature Experimentation flags through [OpenFeature](https://openfeature.dev/) in Node.js server applications. It preserves the Optimizely variation key and decision metadata in each OpenFeature resolution.

## Runtime support

This package is for Node.js server runtimes, including Next.js server code and Hono through its Node adapter. Do not import it into browser or Edge bundles. React clients require a browser provider registered with the OpenFeature web SDK; Edge deployments require a provider built on Optimizely's Universal entry point.

## Installation

```sh
npm install @openfeature/optimizely-provider @openfeature/server-sdk @optimizely/optimizely-sdk
```

`@openfeature/server-sdk` and `@optimizely/optimizely-sdk` are peer dependencies. Use the Optimizely SDK v6 release supported by your application. The provider does not create a client from an SDK key; pass it a configured Optimizely client.

## Setup

Create and configure the Optimizely client in application code, pass it to the provider, and let OpenFeature initialize it:

```ts
import { OpenFeature } from '@openfeature/server-sdk';
import { createInstance } from '@optimizely/optimizely-sdk';
import { OptimizelyProvider } from '@openfeature/optimizely-provider';

const optimizely = createInstance({
  sdkKey: process.env.OPTIMIZELY_SDK_KEY!,
  // Use this when the datafile endpoint requires authentication.
  datafileAccessToken: process.env.OPTIMIZELY_DATAFILE_ACCESS_TOKEN,
});

const provider = new OptimizelyProvider(optimizely);
await OpenFeature.setProviderAndWait(provider);

const client = OpenFeature.getClient();
const enabled = await client.getBooleanValue('checkout-redesign', false, { targetingKey: 'user-123', country: 'US' });

// On application shutdown:
await OpenFeature.clearProviders();
```

See Optimizely's [JavaScript SDK initialization](https://docs.developers.optimizely.com/feature-experimentation/docs/initialize-the-javascript-sdk) and [modular SDK](https://docs.developers.optimizely.com/feature-experimentation/docs/javascript-sdk-v6) documentation for client options, datafile delivery, polling, and readiness.

## Provider options and ownership

```ts
new OptimizelyProvider(client, {
  closeClientOnShutdown: false,
  decideOptions: [],
});
```

The client is borrowed by default. `closeClientOnShutdown: false` means `onClose` will not dispose it; the application remains responsible for its lifetime. Set `closeClientOnShutdown: true` only when the provider owns the client and should close its polling, event-dispatch, and other resources when OpenFeature is cleared. Closing is idempotent.

`decideOptions` is passed to each Optimizely `decideAsync` call. Use it for supported Optimizely decision options such as reasons or delivery rules; the provider does not mutate the array.

The provider waits for the Optimizely client to be ready during initialization. Register it with `setProviderAndWait` when startup must fail fast if the datafile cannot be loaded.

## Evaluation context

`EvaluationContext.targetingKey` is required and is used as the Optimizely user ID. A missing targeting key is reported as an OpenFeature error; the provider does not invent a visitor ID. Other primitive context attributes are passed to Optimizely as user attributes. Keep attributes serializable and avoid putting secrets or personal data in them.

```ts
const context = {
  targetingKey: 'user-123',
  country: 'US',
  plan: 'pro',
  betaTester: true,
};

await OpenFeature.getClient().getBooleanValue('new-checkout', false, context);
```

## Decision and type mapping

Each OpenFeature resolution performs one Optimizely `decideAsync` call because that decision may record an impression. The Optimizely `variationKey` is returned as the OpenFeature `variant`, and the `ruleKey` is exposed as evaluation metadata when available.

Optimizely variables are mapped using the same variable-count convention as the OpenFeature Optimizely provider for Go:

| Optimizely decision  | OpenFeature result                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| No variables         | Boolean evaluation returns `decision.enabled`.                                                                        |
| Exactly one variable | The typed resolver returns that variable's value. The variable name does not become part of the OpenFeature flag key. |
| Multiple variables   | Object evaluation returns an object containing all variable names and values.                                         |

The requested OpenFeature type must match the selected result. A string, number, boolean, or object request that cannot be represented by the decision returns `TYPE_MISMATCH` and the caller's default value. Missing flags return `FLAG_NOT_FOUND`. A disabled decision is still a successful resolution with `enabled: false` and is not treated as an error.

Use an object flag when a decision intentionally exposes multiple Optimizely variables. For a single variable, use the corresponding OpenFeature typed getter and provide a default of the same type.

## Provider events

The provider forwards Optimizely configuration-update notifications as the OpenFeature `PROVIDER_CONFIGURATION_CHANGED` event. This allows applications to observe datafile updates without coupling application code to Optimizely's notification API. Readiness and initialization failures are surfaced through the normal OpenFeature provider lifecycle.

See the OpenFeature [provider lifecycle and events](https://openfeature.dev/docs/reference/concepts/provider) and Optimizely's [notification listener](https://docs.developers.optimizely.com/feature-experimentation/docs/set-up-a-notification-listener-using-the-javascript-sdk) documentation.

## Tracking

`client.track(...)` is translated to an Optimizely user-context `trackEvent` call. The OpenFeature tracking value is passed as Optimizely's numeric `value` when it is numeric. An integer `revenue` detail is preserved when supplied; remaining details are sent as Optimizely event properties under `$opt_event_properties`. Tracking requires a targeting key and is subject to the Optimizely SDK's event-dispatch configuration.

See Optimizely's [track event documentation](https://docs.developers.optimizely.com/feature-experimentation/docs/track-event-for-the-javascript-sdk).

## Errors and limitations

- This package is server-only and uses the asynchronous Optimizely `decideAsync` API. It is not a browser provider.
- A targeting key is mandatory for evaluation and tracking.
- The provider does not manage or expose Optimizely API/admin tokens. An SDK key is sufficient for the normal datafile flow; a datafile access token is only needed when the datafile endpoint is protected.
- Human-readable Optimizely reason strings are not parsed to guess OpenFeature error codes.
- Evaluation failures return the OpenFeature default value and include the provider error code in resolution details, as required by the OpenFeature API.
- Keep the Optimizely client and provider on compatible major versions. The provider intentionally keeps both SDKs external rather than bundling them.

## Deterministic tests and local development

No Optimizely account, SDK key, environment variables, or network access is required to contribute to this provider. The tests use a committed static Optimizely datafile plus mocked clients and event dispatchers.

The deterministic tests cover readiness, missing targeting keys, zero/one/multiple variables, each OpenFeature type, disabled decisions, variant and metadata mapping, one decision per evaluation, tracking, configuration changes, and client ownership on shutdown.

From the repository root:

```sh
npx nx test optimizely --no-watchman
npx nx lint optimizely
npx nx package optimizely
```

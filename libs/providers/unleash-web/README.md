# unleash-web Provider

## About this provider

This provider is a community-developed implementation for Unleash which uses the official [Unleash Proxy Client for the browser Client Side SDK](https://docs.getunleash.io/reference/sdks/javascript-browser).

This provider uses a **static evaluation context** suitable for client-side implementation.

Suitable for connecting to an Unleash instance

- Via the [Unleash front-end API](https://docs.getunleash.io/reference/front-end-api).
- Via [Unleash Edge](https://docs.getunleash.io/reference/unleash-edge).
- Via [Unleash Proxy](https://docs.getunleash.io/reference/unleash-proxy).

[Gitlab Feature Flags](https://docs.gitlab.com/ee/operations/feature_flags.html) can also be used with this provider - although note that Unleash Edge is not currently supported by Gitlab.

### Concepts

- Boolean evaluation gets feature enabled status.
- String, Number, and Object evaluation gets feature variant value.
- Object evaluation should be used for JSON/CSV payloads in variants.

## Installation

```shell
npm install @openfeature/unleash-web-provider @openfeature/web-sdk
```

## Usage

To initialize the OpenFeature client with Unleash, you can use the following code snippets:

### Initialization - without context

```ts
import { UnleashWebProvider } from '@openfeature/unleash-web-provider';

const provider = new UnleashWebProvider({
  url: 'http://your.upstream.unleash.instance',
  clientKey: 'theclientkey',
  appName: 'your app',
});

await OpenFeature.setProviderAndWait(provider);
```

### Initialization - with context

The [Unleash context](https://docs.getunleash.io/reference/unleash-context) can be set during creation of the provider.

```ts
import { UnleashWebProvider } from '@openfeature/unleash-web-provider';

const context = {
  userId: '123',
  sessionId: '456',
  remoteAddress: 'address',
  properties: {
    property1: 'property1',
    property2: 'property2',
  },
};

const provider = new UnleashWebProvider({
  url: 'http://your.upstream.unleash.instance',
  clientKey: 'theclientkey',
  appName: 'your app',
  context: context,
});

await OpenFeature.setProviderAndWait(provider);
```

### Available Constructor Configuration Options

Unleash has a variety of configuration options that can be provided to the `UnleashWebProvider` constructor.

Please refer to the options described in the official [Unleash Proxy Client for the browser Client Side SDK](https://docs.getunleash.io/reference/sdks/javascript-browser#available-options).

### After initialization

After the provider gets initialized, you can start evaluations of feature flags like so:

```ts
// Get the client
const client = await OpenFeature.getClient();

// You can now use the client to evaluate your flags
const details = client.getBooleanValue('my-feature', false);
```

The static evaluation context can be changed if needed

```ts
const evaluationCtx: EvaluationContext = {
  usedId: 'theuser',
  currentTime: 'time',
  sessionId: 'theSessionId',
  remoteAddress: 'theRemoteAddress',
  environment: 'theEnvironment',
  appName: 'theAppName',
  aCustomProperty: 'itsValue',
  anotherCustomProperty: 'somethingForIt',
};

// changes the static evaluation context for OpenFeature
await OpenFeature.setContext(evaluationCtx);
```

## Use with React, Angular, and other web frameworks

This provider targets the [OpenFeature Web SDK](https://github.com/open-feature/js-sdk/tree/main/packages/web). The OpenFeature **React** and **Angular** SDKs are built on top of that same Web SDK, so you can use **the same `UnleashWebProvider`** in those frameworks with no changes — just install the framework SDK and set the provider as usual. The same applies to any other OpenFeature SDK built on the Web SDK.

### React framework

#### 1. Install the React SDK and this provider

```shell
npm install @openfeature/react-sdk @openfeature/unleash-web-provider
```

#### 2. Set the provider and wrap your app

```tsx
import { OpenFeature, OpenFeatureProvider } from '@openfeature/react-sdk';
import { UnleashWebProvider } from '@openfeature/unleash-web-provider';

const provider = new UnleashWebProvider({
  url: 'https://your.upstream.unleash.instance',
  clientKey: 'theclientkey',
  appName: 'your app',
});

OpenFeature.setContext({ userId: 'user-1' });

OpenFeature.setProvider(provider);

function App() {
  return (
    <OpenFeatureProvider>
      <Page />
    </OpenFeatureProvider>
  );
}
```

#### 3. Evaluate a flag with the `useFlag` hook

```tsx
import { useFlag } from '@openfeature/react-sdk';

function Page() {
  const { value: isAwesomeFeatureEnabled } = useFlag('isAwesomeFeatureEnabled', false);
  return <div>{isAwesomeFeatureEnabled ? 'Awesome feature is enabled!' : 'Not enabled.'}</div>;
}
```

See the [OpenFeature React SDK documentation](https://openfeature.dev/docs/reference/technologies/client/web/react) for hooks, suspense, and re-render behavior.

To try the provider end-to-end without building an app from scratch, drop it into OpenFeature's [react-test-app](https://github.com/open-feature/react-test-app) — steps 1 and 2 above are all you need to change.

### Angular framework

#### 1. Install the Angular SDK and this provider

```shell
npm install @openfeature/angular-sdk @openfeature/unleash-web-provider
```

#### 2. Register the provider

Create the provider once and pass it to `OpenFeatureModule.forRoot`.

```ts
import { type EvaluationContext } from '@openfeature/angular-sdk';
import { UnleashWebProvider } from '@openfeature/unleash-web-provider';

const provider = new UnleashWebProvider({
  url: 'https://your.upstream.unleash.instance',
  clientKey: 'theclientkey',
  appName: 'your app',
});

const initialContext: EvaluationContext = { userId: 'user-1' };
```

For applications using **NgModules**:

```ts
import { NgModule } from '@angular/core';
import { BooleanFeatureFlagDirective, OpenFeatureModule } from '@openfeature/angular-sdk';

@NgModule({
  imports: [
    OpenFeatureModule.forRoot({ provider, context: initialContext }),
    BooleanFeatureFlagDirective, // or import it directly in your components
  ],
})
export class AppModule {}
```

For applications using **standalone components**:

```ts
import { type ApplicationConfig, importProvidersFrom } from '@angular/core';
import { OpenFeatureModule } from '@openfeature/angular-sdk';

export const appConfig: ApplicationConfig = {
  providers: [
    importProvidersFrom(OpenFeatureModule.forRoot({ provider, context: initialContext })),
  ],
};
```

#### 3. Evaluate a flag with a directive

```html
<div *booleanFeatureFlag="'isAwesomeFeatureEnabled'; default: false; else: disabled">
  This is shown when the feature flag is enabled.
</div>
<ng-template #disabled>This is shown when the feature flag is disabled.</ng-template>
```

See the [OpenFeature Angular SDK documentation](https://openfeature.dev/docs/reference/technologies/client/web/angular/) for the full set of directives and their `initializing`/`reconciling` templates.

Likewise, OpenFeature's [angular-test-app](https://github.com/open-feature/angular-test-app) is a ready-made way to try the provider locally — apply steps 1 and 2 above.

### Notes

- **Same provider, framework-agnostic.** React, Angular, and other web-SDK-based integrations all use the same `UnleashWebProvider` and the [constructor options](https://docs.getunleash.io/reference/sdks/javascript-browser#available-options) documented above — only the OpenFeature SDK package differs.
- **Static context.** This is a client-side provider, so the evaluation context is static: set it once via `OpenFeature.setContext(...)` (or the provider's `context` option) and update it with `OpenFeature.setContext(...)` when the user changes. Use `userId` (and the other [Unleash context](https://docs.getunleash.io/reference/unleash-context) fields) rather than `targetingKey`.
- **Initialization.** With the plain Web SDK, await `OpenFeature.setProviderAndWait(provider)`. The React and Angular SDKs manage readiness for you (suspense / `initializing` templates), so awaiting is not required there.

## Contribute

### Building

Run `nx package providers-unleash-web` to build the library.

### Running unit tests

Run `nx test providers-unleash-web` to execute the unit tests via [Jest](https://jestjs.io).

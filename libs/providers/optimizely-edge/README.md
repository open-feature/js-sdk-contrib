# Optimizely Edge Provider

This package adapts the Optimizely Feature Experimentation JavaScript SDK's
Universal entry point to OpenFeature in Web API-based server runtimes such as
Next.js Edge and Cloudflare Workers (including Hono applications deployed to
Workers).

It is separate from the Node.js and browser providers so an edge bundle never
resolves Optimizely's Node or `XMLHttpRequest` implementation by accident.

## Installation

```sh
npm install @openfeature/optimizely-edge-provider @openfeature/web-sdk @optimizely/optimizely-sdk
```

The OpenFeature JavaScript server SDK is Node.js-specific. Edge applications
therefore use the synchronous, Web API-compatible OpenFeature web SDK with this
provider. React client components should continue to use
[`@openfeature/optimizely-web-provider`](../optimizely-web/README.md); Node.js
server code should use [`@openfeature/optimizely-provider`](../optimizely/README.md).

## Universal client setup

Optimizely's Universal SDK requires an application-supplied project config
manager and request handler. Load and cache the datafile with the APIs provided
by your deployment platform, then construct the client from the explicit
`/universal` entry point:

```ts
import { OpenFeature } from '@openfeature/web-sdk';
import {
  OptimizelyDecideOption,
  createInstance,
  createStaticProjectConfigManager,
} from '@optimizely/optimizely-sdk/universal';
import { OptimizelyEdgeProvider, createFetchRequestHandler } from '@openfeature/optimizely-edge-provider';

export async function initializeOptimizelyEdge(datafile: string) {
  const requestHandler = createFetchRequestHandler();
  const optimizely = createInstance({
    projectConfigManager: createStaticProjectConfigManager({ datafile }),
    requestHandler,
    disposable: true,
    // The portable setup below performs decisions only. See Event delivery.
    defaultDecideOptions: [OptimizelyDecideOption.DISABLE_DECISION_EVENT],
  });

  const provider = new OptimizelyEdgeProvider(optimizely, {
    closeClientOnShutdown: true,
  });
  await OpenFeature.setProviderAndWait(provider);

  return { client: OpenFeature.getClient(), provider };
}
```

Call this lazily from an incoming request, or use a datafile bundled at build
time. Cloudflare Workers do not allow `fetch()` at module scope. Cache the
resulting initialization promise per isolate instead of replacing the global
OpenFeature provider for every request.

The OpenFeature web SDK has static global/domain context rather than the server
SDK's per-invocation context argument. Mutating that static context for each
request would let concurrent requests overwrite one another. Use the provider's
synchronous context scope instead:

```ts
const { client, provider } = await initializeOnce();

const enabled = provider.withEvaluationContext({ targetingKey: user.id, country: user.country }, () =>
  client.getBooleanValue('checkout-redesign', false),
);
```

`withEvaluationContext` restores the previous context before returning, so
separate synchronous evaluation scopes cannot leak identity. Its callback must
remain synchronous; perform request I/O before entering the scope.

## Next.js Edge and Hono

The provider has no framework dependency. A Next.js Edge route can evaluate
after awaiting the application's cached initialization promise:

```ts
export const runtime = 'edge';

export async function GET(request: Request) {
  const { client, provider } = await getInitializedFeatureClient();
  const enabled = provider.withEvaluationContext(
    { targetingKey: request.headers.get('x-user-id') ?? crypto.randomUUID() },
    () => client.getBooleanValue('checkout-redesign', false),
  );

  return Response.json({ enabled });
}
```

The same initialized client works inside a Hono handler deployed to Cloudflare
Workers:

```ts
app.get('/flags/:key', async (c) => {
  const { client, provider } = await getInitializedFeatureClient(c.env);
  const value = provider.withEvaluationContext({ targetingKey: c.req.header('x-user-id') ?? crypto.randomUUID() }, () =>
    client.getBooleanValue(c.req.param('key'), false),
  );

  return c.json({ value });
});
```

The application-specific `getInitializedFeatureClient` function should load
the datafile from a build asset, KV, or a platform cache and reuse the initialized
client while that datafile is current. The provider deliberately does not hide
Next.js cache options or Cloudflare's Cache API behind a lowest-common-denominator
abstraction.

## Event delivery

Decision impressions and tracking require an Optimizely event processor. Edge
runtimes may cancel un-awaited network work after returning a response, so event
delivery is platform-specific. On Cloudflare Workers, connect the request
handler to the current execution context:

```ts
import { waitUntil } from 'cloudflare:workers';
import {
  createEventDispatcher,
  createForwardingEventProcessor,
  createInstance,
  createStaticProjectConfigManager,
} from '@optimizely/optimizely-sdk/universal';

const requestHandler = createFetchRequestHandler({
  schedule: waitUntil,
});
const optimizely = createInstance({
  projectConfigManager: createStaticProjectConfigManager({ datafile }),
  eventProcessor: createForwardingEventProcessor(createEventDispatcher(requestHandler)),
  requestHandler,
  disposable: true,
});
```

Cloudflare's imported `waitUntil` binds to the current invocation, so a shared
client does not retain an expired request context. Do not close over a Hono
`c.executionCtx` or Worker `ctx` in a client that is cached across requests.
Where the platform has no background-lifetime primitive, event delivery is best
effort unless the application keeps the request alive until the event request
settles.

## Runtime and decision limitations

- Only the explicit `@optimizely/optimizely-sdk/universal` entry point is
  supported. Do not import the package root in an edge bundle.
- Datafile loading, caching, and revalidation belong to the application. The
  provider does not start Node.js polling, access a filesystem, or fetch at
  module scope.
- Evaluation is synchronous because the edge-safe OpenFeature SDK exposes
  synchronous provider resolvers. Optimizely features that require asynchronous
  decisions, including CMAB or asynchronous user-profile/ODP flows, are not
  supported. Use the Node.js provider for those cases.
- Request-specific targeting must use `withEvaluationContext` around synchronous
  OpenFeature reads. Do not call the web SDK's global `setContext` per request,
  and do not cross an `await` inside the scoped callback.
- `targetingKey` is required and maps to the Optimizely user ID. Other primitive
  invocation-context fields map to Optimizely user attributes.
- Variable, error, variant, metadata, tracking, and lifecycle behavior otherwise
  match the web provider.

## Building and testing

```sh
npx nx test optimizely-edge --no-watchman
npx nx run optimizely-edge:test-edge --no-watchman
npx nx lint optimizely-edge
npx nx package optimizely-edge
```

The edge suite runs under a restricted Web Worker environment, constructs the
Optimizely Universal client from a static datafile, and verifies typed
OpenFeature evaluations without credentials or network access.

## Related documentation

- [Optimizely JavaScript SDK](https://github.com/optimizely/javascript-sdk)
- [Optimizely Edge SDKs](https://docs.developers.optimizely.com/feature-experimentation/docs/get-started-edge-functions)
- [Next.js Edge Runtime](https://nextjs.org/docs/pages/api-reference/edge)
- [Cloudflare Workers runtime APIs](https://developers.cloudflare.com/workers/runtime-apis/)
- [OpenFeature web SDK](https://openfeature.dev/docs/reference/technologies/client/web)

# Client-Side OFREP Provider

This provider is designed to use the [OpenFeature Remote Evaluation Protocol (OFREP)](https://openfeature.dev/specification/appendix-c).

## Installation

### npm

```sh
npm install @openfeature/ofrep-web-provider
```

### yarn

```sh
yarn add @openfeature/ofrep-web-provider @openfeature/ofrep-core @openfeature/web-sdk @openfeature/core
```

> [!NOTE]
> yarn requires manual installation of peer dependencies

## Configurations and Usage

The provider needs the base url of the OFREP server for instantiation.

```ts
import { OFREPWebProvider } from '@openfeature/ofrep-web-provider';

OpenFeature.setProvider(new OFREPWebProvider({ baseUrl: 'https://localhost:8080' }));
```

### Polling and refresh

By default, polling is disabled (`pollInterval` defaults to `0`). To enable periodic flag re-evaluation, set `pollInterval` to a positive number of milliseconds:

```ts
OpenFeature.setProvider(new OFREPWebProvider({ baseUrl: 'https://localhost:8080', pollInterval: 60_000 }));
```

Flags are automatically re-fetched when the page becomes visible (e.g. the user switches back to the tab). This follows [ADR-0010](https://github.com/open-feature/protocol/pull/69) and is **enabled by default**. To opt out:

```ts
OpenFeature.setProvider(
  new OFREPWebProvider({ baseUrl: 'https://localhost:8080', disableVisibilityRefresh: true }),
);
```

### HTTP headers

The provider can use headers from either a static header map or a custom header factory.

#### Static Headers

Headers can be given as a list of tuples or as a map of headers.

```ts
import { OFREPWebProvider } from '@openfeature/ofrep-web-provider';

OpenFeature.setProvider(
  new OFREPWebProvider({
    baseUrl: 'https://localhost:8080',
    headers: [
      ['Authorization', `my-api-key`],
      ['X-My-Header', `CustomHeaderValue`],
    ],
  }),
);
```

```ts
import { OFREPWebProvider } from '@openfeature/ofrep-web-provider';

OpenFeature.setProvider(
  new OFREPWebProvider({
    baseUrl: 'https://localhost:8080',
    headers: { Authorization: `my-api-key`, 'X-My-Header': `CustomHeaderValue` },
  }),
);
```

#### Header Factory

The header factory is evaluated before every flag evaluation which makes it possible to use dynamic values for the headers.

The following shows an example of loading a token and using it as bearer token.

```ts
import { OFREPWebProvider } from '@openfeature/ofrep-web-provider';

OpenFeature.setProvider(
  new OFREPWebProvider({
    baseUrl: 'https://localhost:8080',
    headersFactory: () => {
      const token: string = loadDynamicToken();
      return [['Authorization', `Bearer ${token}`]];
    },
  }),
);
```

### Caching

The provider supports persistent local caching via `localStorage` per [ADR-0009](https://github.com/open-feature/protocol/blob/main/service/adrs/0009-local-storage-for-static-context-providers.md). Caching reduces latency on startup and improves resilience to transient network failures.

#### Cache modes

**`cacheMode`** controls the startup strategy:

- `'local-cache-first'` _(default)_ — `initialize()` resolves immediately from the persisted cache if one exists, then refreshes from the network in the background. Evaluations served before the refresh completes will have reason `CACHED`.
- `'network-first'` — `initialize()` blocks on the network request. The persisted cache is used as a fallback only on transient failures (network unavailable, timeout, 5xx). Auth and configuration errors (400, 401, 403, 404) are always surfaced immediately and never masked by cached values.
- `'disabled'` — no persistence. `initialize()` always blocks on the network and the other cache options have no effect.

**`cacheTTL`** — maximum age in seconds of a persisted cache entry before it is treated as a miss and removed. Defaults to `2_592_000` (30 days). Auth and configuration errors do not clear persisted entries; TTL governs expiry.

#### Cache key

Persisted entries are keyed by a hash of key material returned by a cache-key generator, not the full evaluation context. The default generator uses:

1. **`baseUrl`** — the configured OFREP base URL
2. **Auth credential** — serialized from known auth headers (`Authorization`, `Api-Key`, `X-Api-Key`, `X-Auth-Token`, `X-Access-Token`), taken from `headers` and `headersFactory` at read/write time
3. **`domain`** — the OpenFeature domain the provider is bound to via `OpenFeature.setProvider('domain', provider)` (passed to `initialize()` by the SDK; empty when registered as the default provider)
4. **`targetingKey`** — the evaluation context's targeting key

Use **`cacheKeyGenerator`** to customize the key material (namespace instances, drop auth for rotating tokens, or include stable context fields). The provider always hashes whatever the generator returns.

The localStorage key is `ofrep-web-provider:v3:{hash}` where `{hash}` is the first 16 hex characters of SHA-256 (or an FNV-1a fallback in non-secure contexts where `crypto.subtle` is unavailable).

#### Domain scoping

The provider declares itself `domain-scoped`, so each instance is bound to at most one OpenFeature domain via `OpenFeature.setProvider('domain', provider)`. The SDK forwards that domain to `initialize(context, domain?)`; persistence is not initialized until then, so nothing is read from or written to `localStorage` before initialization.

Bind a separate provider instance per domain in micro-frontend or multi-tenant setups:

```ts
OpenFeature.setProvider('billing', new OFREPWebProvider({ baseUrl: 'https://flags.example.com' }));
OpenFeature.setProvider('checkout', new OFREPWebProvider({ baseUrl: 'https://flags.example.com' }));
```

#### Auth headers and rotating tokens

Only the auth header names listed above participate in the cache key. Other custom headers (for example `X-My-Header`) are sent on requests but do not affect persistence.

```ts
import { OFREPWebProvider } from '@openfeature/ofrep-web-provider';

OpenFeature.setProvider(
  'my-app',
  new OFREPWebProvider({
    baseUrl: 'https://localhost:8080',
    cacheMode: 'local-cache-first',
    cacheTTL: 3600, // 1 hour
    cacheKeyGenerator: (input) => `my-app:${JSON.stringify([input.url, input.auth, input.domain, input.targetingKey])}`,
    headers: [['Authorization', 'my-api-key']],
  }),
);
```

### Fetch implementation

If needed, a custom fetch implementation can be injected, if e.g. the platform does not have fetch built in.

```ts
import { OFREPWebProvider } from '@openfeature/ofrep-web-provider';
import { fetchPolyfill } from 'some-fetch-polyfill';

OpenFeature.setProvider(
  new OFREPWebProvider({
    baseUrl: 'https://localhost:8080',
    fetchImplementation: fetchPolyfill,
  }),
);
```

## Building

Run `nx package providers-ofrep-web` to build the library.

## Running unit tests

Run `nx test providers-ofrep-web` to execute the unit tests via [Jest](https://jestjs.io).

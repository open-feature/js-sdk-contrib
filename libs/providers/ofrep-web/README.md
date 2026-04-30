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

OpenFeature.setProvider(new OFREPWebProvider({ baseUrl: 'https://localhost:8080', pollInterval: 60000 }));
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

The provider supports persistent local caching via `localStorage` to reduce latency on startup and improve resilience to transient network failures. Caching is controlled with three options.

**`cacheMode`** — controls the startup strategy:

- `'local-cache-first'` _(default)_ — `initialize()` resolves immediately from the persisted cache if one exists, then refreshes from the network in the background. Evaluations served before the refresh completes will have reason `CACHED`.
- `'network-first'` — `initialize()` blocks on the network request. The persisted cache is used as a fallback only on transient failures (network unavailable, timeout, 5xx). Auth and configuration errors (400, 401, 403, 404) are always surfaced immediately and never masked by cached values.
- `'disabled'` — no persistence. `initialize()` always blocks on the network and the other cache options have no effect.

**`cacheTTL`** — maximum age in seconds of a persisted cache entry before it is treated as a miss and removed. Defaults to `2_592_000` (30 days).

**`cacheKeyPrefix`** — a string included in the cache key to avoid collisions when multiple provider instances share the same browser origin. A good value is the OFREP base URL or a project key.

```ts
import { OFREPWebProvider } from '@openfeature/ofrep-web-provider';

OpenFeature.setProvider(
  new OFREPWebProvider({
    baseUrl: 'https://localhost:8080',
    cacheMode: 'local-cache-first',
    cacheTTL: 3600, // 1 hour
    cacheKeyPrefix: 'my-app',
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

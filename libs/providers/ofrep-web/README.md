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

### Local cache

The web provider persists the most recent bulk evaluation response in `localStorage` by default under the `ofrepLocalCache` key.

On startup, the provider will:

- load a persisted snapshot only when it matches the current `targetingKey` and `Authorization` header hash
- send the stored `ETag` as `If-None-Match`
- keep using the hydrated snapshot when the next bulk request returns `304 Not Modified`
- fall back to the hydrated snapshot when startup fails because of a network error, timeout, or temporary `5xx` response

Recovered values can be stale until the next successful bulk evaluation completes.

You can customize or disable this behavior:

```ts
import { OFREPWebProvider } from '@openfeature/ofrep-web-provider';

OpenFeature.setProvider(
  new OFREPWebProvider({
    baseUrl: 'https://localhost:8080',
    storageKey: 'customOfrepCache',
    disableLocalCache: false,
  }),
);
```

To disable persistence entirely:

```ts
import { OFREPWebProvider } from '@openfeature/ofrep-web-provider';

OpenFeature.setProvider(
  new OFREPWebProvider({
    baseUrl: 'https://localhost:8080',
    disableLocalCache: true,
  }),
);
```

If you need something other than `localStorage`, provide a compatible storage adapter through `storageAdapter`.

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

### Fetch implementation

If needed, a custom fetch implementation can be injected, if e.g. the platform does not have fetch built in.

```ts
import { OFREPWebProvider } from '@openfeature/ofrep-web-provider';
import { fetchPolyfill } from 'some-fetch-polyfill';

OpenFeature.setProvider(
  new OFREPWebProvider({
    baseUrl: 'https://localhost:8080',
    fetchImplementation: fetchPolyfill
  }),
);
```

## Building

Run `nx package providers-ofrep-web` to build the library.

## Running unit tests

Run `nx test providers-ofrep-web` to execute the unit tests via [Jest](https://jestjs.io).

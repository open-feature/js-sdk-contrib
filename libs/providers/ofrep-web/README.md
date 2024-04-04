# Client-Side OFREP Provider

This provider is designed to use the [OpenFeature Remote Evaluation Protocol (OFREP)](https://openfeature.dev/specification/appendix-c).

## Installation

### npm

```sh
npm install @openfeature/ofrep-web
```

### yarn

```sh
yarn add @openfeature/ofrep-web @openfeature/ofrep-core @openfeature/web-sdk
```

> [!NOTE]
> yarn requires manual installation of peer dependencies

## Configurations and Usage

The provider needs the base url of the OFREP server for instantiation.

```ts
import { OFREPWebProvider } from '@openfeature/ofrep-web';

OpenFeature.setProvider(new OFREPWebProvider({ baseUrl: 'https://localhost:8080', pollingInterval: 60000 }));
```

### HTTP headers

The provider can use headers from either a static header map or a custom header factory.

#### Static Headers

Headers can be given as a list of tuples or as a map of headers.

```ts
import { OFREPWebProvider } from '@openfeature/ofrep-web';

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
import { OFREPWebProvider } from '@openfeature/ofrep-web';

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
import { OFREPWebProvider } from '@openfeature/ofrep-web';

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
import { OFREPWebProvider } from '@openfeature/ofrep-web';
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

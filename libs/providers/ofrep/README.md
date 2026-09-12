# Server-Side OFREP Provider

This provider is designed to use the [OpenFeature Remote Evaluation Protocol (OFREP)](https://openfeature.dev/specification/appendix-c).

## Installation

### npm

```sh
npm install @openfeature/ofrep-provider
```

### yarn

```sh
yarn add @openfeature/ofrep-provider @openfeature/ofrep-core @openfeature/server-sdk
```

> [!NOTE]
> yarn requires manual installation of peer dependencies

## Configurations and Usage

The provider needs the base url of the OFREP server for instantiation.

```ts
import { OFREPProvider } from '@openfeature/ofrep-provider';

OpenFeature.setProvider(new OFREPProvider({ baseUrl: 'https://localhost:8080' }));
```

### Environment Variables

The provider supports environment variables for default configuration. These are used when options are not explicitly provided:

| Environment Variable | Description                                           | Example                                       |
| -------------------- | ----------------------------------------------------- | --------------------------------------------- |
| `OFREP_ENDPOINT`     | The endpoint of the GO Feature Flag relay-proxy       | `http://localhost:2321`                       |
| `OFREP_TIMEOUT_MS`   | HTTP request timeout in milliseconds                  | `5000`                                        |
| `OFREP_HEADERS`      | Additional headers as comma-separated key=value pairs | `Authentication=Bearer 123,Content-Type=json` |

#### Example using environment variables:

```bash
export OFREP_ENDPOINT=http://localhost:2321
export OFREP_TIMEOUT_MS=5000
export OFREP_HEADERS=Authentication=Bearer 123,Content-Type=json
```

**Note**: Explicitly provided options always take precedence over environment variables.

### HTTP headers

The provider can use headers from either a static header map or a custom header factory.

#### Static Headers

Headers can be given as a list of tuples or as a map of headers.

```ts
import { OFREPProvider } from '@openfeature/ofrep-provider';

OpenFeature.setProvider(
  new OFREPProvider({
    baseUrl: 'https://localhost:8080',
    headers: [
      ['Authorization', `my-api-key`],
      ['X-My-Header', `CustomHeaderValue`],
    ],
  }),
);
```

```ts
import { OFREPProvider } from '@openfeature/ofrep-provider';

OpenFeature.setProvider(
  new OFREPProvider({
    baseUrl: 'https://localhost:8080',
    headers: { Authorization: `my-api-key`, 'X-My-Header': `CustomHeaderValue` },
  }),
);
```

#### Header Factory

The header factory is evaluated before every flag evaluation which makes it possible to use dynamic values for the headers.

The following shows an example of loading a token and using it as bearer token.

```ts
import { OFREPProvider } from '@openfeature/ofrep-provider';

OpenFeature.setProvider(
  new OFREPProvider({
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
import { OFREPProvider } from '@openfeature/ofrep-provider';
import { fetchPolyfill } from 'some-fetch-polyfill';

OpenFeature.setProvider(
  new OFREPProvider({
    baseUrl: 'https://localhost:8080',
    fetchImplementation: fetchPolyfill,
  }),
);
```

## Building

Run `nx package providers-ofrep` to build the library.

## Running unit tests

Run `nx test providers-ofrep` to execute the unit tests via [Jest](https://jestjs.io).

## Running the conformance suite

This provider adopts the [OpenFeature Provider TCK](../../shared/tck/README.md):

```sh
npx nx tck providers-ofrep
```

It needs a **Docker daemon**. The suite brings up
[`src/e2e/tck/docker-compose.yaml`](./src/e2e/tck/docker-compose.yaml) itself — a pinned
flagd-testbed image, used because flagd serves OFREP and its launchpad is the reference
implementation of the suite's control API — discovers the mapped ports, and drives the backend over
that API.

**It is deliberately excluded from the default build, and from CI.** The mechanism: the suite lives
in `src/e2e/tck/` behind a Jest project of its own
([`src/e2e/tck/jest.config.ts`](./src/e2e/tck/jest.config.ts)), reached only by a `tck` target. The
name matters — `npm run e2e` is `nx run-many --all --target=e2e` and CI has a job for it, so an `e2e`
target here would pull a backend image on every push. `npx nx tck providers-ofrep` is the only way
in; run it by hand before merging a change to this provider or to the suite.

Why an adoption suite is excluded rather than made a required gate is
[Appendix F, "Running the suite in CI"](https://github.com/open-feature/spec/blob/main/specification/appendix-f-provider-conformance.md).
Both mistakes it names were live here: this suite originally _created_ an `e2e` target where the
project had none, and nothing said it was meant to be excluded.

The claim is pinned to the exact image tag in that Compose file, so a bump is a deliberate act with a
result to record.

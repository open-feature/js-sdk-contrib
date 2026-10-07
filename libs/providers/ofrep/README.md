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
[`libs/shared/tck-backend/docker-compose.yaml`](../../shared/tck-backend/docker-compose.yaml) itself
— a pinned flagd-testbed image, used because flagd serves OFREP and its launchpad is the reference
implementation of the suite's control API, and shared with the flagd adoption so the two cannot
drift onto different backends — discovers the mapped ports, and drives the backend over that API.
OFREP is a protocol rather than a product, so any conformant server would do; a conformance result
is a claim about that exact image tag.

**Scope: this package only.** [`libs/providers/ofrep-web`](../ofrep-web/README.md) is deliberately
not adopted. It is the only OFREP provider in this repository with events, a STALE state and a
failable initialisation — the parts of the contract the suite is most useful for — but none of them
can be exercised against flagd: flagd's OFREP handler never writes an `ETag` and never reads
`If-None-Match`, so the `304` path the web provider's polling depends on is unreachable, and its
bulk response carries no `eventStreams` field, so the SSE path is unreachable too. Adopting it
against this backend would declare capabilities that the backend, not the provider, makes
untestable. It waits for a neutral OFREP testbed.

**The suite lives in `src/tck/`, behind a `tck` target**, which is what keeps it out of the default
build and out of CI: it sits in a Jest project of its own
([`src/tck/jest.config.ts`](./src/tck/jest.config.ts)) and the provider's unit config ignores
`/src/tck/`. The target's name matters — `npm run e2e` is `nx run-many --all --target=e2e` and CI
has a job for it, so an `e2e` target here would pull a backend image on every push. Run
`npx nx tck providers-ofrep` by hand before merging a change to this provider or to the TCK.

The `tck` target's wiring — `passWithNoTests: false`, and a `tck:pullSpec` dependency so the suite
cannot run against the previous pin's feature files — is described in the
[TCK's own README](../../shared/tck/README.md). Why an adoption suite is excluded rather than made a
required gate is
[Appendix F](https://github.com/open-feature/spec/blob/main/specification/appendix-f-provider-conformance.md).

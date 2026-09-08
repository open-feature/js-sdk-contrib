# Optimizely Web Provider

This package is the browser/client counterpart to the server-only
[`@openfeature/optimizely-provider`](../optimizely/README.md). It is intended for
browser applications that use the Optimizely Feature Experimentation JavaScript
SDK and OpenFeature's web SDK. It adapts synchronous Optimizely decisions to
OpenFeature's browser evaluation API.

## Installation

```sh
npm install @openfeature/optimizely-web-provider @openfeature/web-sdk @optimizely/optimizely-sdk
```

For React, install the React bindings separately:

```sh
npm install @openfeature/react-sdk
```

The provider package, OpenFeature web SDK, React bindings, and Optimizely SDK
are separate dependencies. The React SDK is a UI integration layer; it does not
turn the server provider into a browser provider.

## Intended browser setup

Use the explicit browser entry point when constructing the Optimizely client so
the bundler does not select the Node.js SDK entry point:

```ts
import { OpenFeature } from '@openfeature/web-sdk';
import { createInstance } from '@optimizely/optimizely-sdk/browser';
import { OptimizelyWebProvider } from '@openfeature/optimizely-web-provider';

const optimizely = createInstance({ sdkKey: import.meta.env.VITE_OPTIMIZELY_SDK_KEY });
const provider = new OptimizelyWebProvider(optimizely);

await OpenFeature.setProviderAndWait(provider);
```

Register the provider before rendering flag-dependent React UI. The React SDK
then consumes the web client normally:

```tsx
'use client';

import { OpenFeatureProvider } from '@openfeature/react-sdk';
import { OpenFeature } from '@openfeature/web-sdk';
import type { ReactNode } from 'react';

export function FeatureProvider({ children }: { children: ReactNode }) {
  return <OpenFeatureProvider client={OpenFeature.getClient()}>{children}</OpenFeatureProvider>;
}
```

The exact client options and datafile behavior come from Optimizely's
[JavaScript SDK documentation](https://docs.developers.optimizely.com/feature-experimentation/docs/javascript-sdk-v6).
Do not expose server-only credentials in a browser bundle. An SDK key is not a
secret, but datafile access tokens and REST/API tokens must remain server-side.

The browser provider must use the Optimizely synchronous `decide` API because
the OpenFeature web SDK resolves flags synchronously. Optimizely features that
require asynchronous decisions, including ODP-dependent or other async decision
cases, are unsupported by this provider. Use the server provider from a Node.js
boundary for those cases.

## Framework compatibility

| Application surface                                     | Package and runtime                                                                  | Status                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| React client components                                 | `@openfeature/react-sdk` + `@openfeature/web-sdk` + this package in a browser bundle | Supported by the provider contract                                 |
| Next.js client components                               | Same browser packages in the client bundle                                           | Supported; initialize behind a `'use client'` boundary             |
| Next.js Server Components and route handlers on Node.js | `@openfeature/server-sdk` + `@openfeature/optimizely-provider`                       | Use the server package instead                                     |
| Hono on Node.js                                         | `@openfeature/server-sdk` + `@openfeature/optimizely-provider`                       | Use the server package instead                                     |
| Next.js Edge runtime or Cloudflare Workers              | Browser provider or Node provider                                                    | Unsupported/unverified; no framework/runtime test is provided here |

The provider is not a Next.js or React plugin. React applications should use
the [OpenFeature React SDK](https://openfeature.dev/docs/reference/technologies/client/react)
and the web SDK provider registration pattern; Hono and server-side Next.js
code should use the server package.

## Lifecycle, context, and tracking

The web provider initializes the browser Optimizely client before flag reads
and closes only a client explicitly owned by the provider. An
OpenFeature `targetingKey` maps to the Optimizely user ID; primitive context
attributes map to Optimizely user attributes. The Optimizely variation key maps
to OpenFeature's `variant`, and the rule key maps to flag metadata. Tracking is
forwarded to the Optimizely user-context `trackEvent` API.

Variable mapping matches the server provider: a flag with no variables resolves
as a boolean, one variable resolves through its matching typed getter, and
multiple variables resolve as an object.

## Building and testing

```sh
npx nx package optimizely-web
npx nx test optimizely-web --no-watchman
npx nx lint optimizely-web
```

The deterministic suite uses a static Optimizely datafile and covers the web
provider contract, typed decisions, lifecycle, context, tracking, and client
ownership without credentials or network access. No framework-specific Next.js,
React, Hono, Edge, or Cloudflare integration test is included.

## Related documentation

- [OpenFeature web SDK](https://openfeature.dev/docs/reference/technologies/client/web)
- [OpenFeature React SDK](https://openfeature.dev/docs/reference/technologies/client/react)
- [Optimizely JavaScript SDK](https://docs.developers.optimizely.com/feature-experimentation/docs/javascript-sdk-v6)
- [Optimizely browser SDK initialization](https://docs.developers.optimizely.com/feature-experimentation/docs/initialize-the-javascript-sdk)

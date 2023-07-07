:warning: This package will be deprecated. Please use TracingHook from `@openfeature/open-telemetry-hooks`.

# OpenTelemetry Hook

The OpenTelemetry hook for OpenFeature provides a [spec compliant][otel-spec] way to automatically add a feature flag evaluation to a span as a span event. Since feature flags are dynamic and affect runtime behavior, it’s important to collect relevant feature flag telemetry signals. This can be used to determine the impact a feature has on a request, enabling enhanced observability use cases, such as A/B testing or progressive feature releases.

## Installation

```
$ npm install @openfeature/open-telemetry-hook
```

### Peer dependencies

Confirm that the following peer dependencies are installed.

```
$ npm install @openfeature/js-sdk @opentelemetry/api
```

## Usage

OpenFeature provides various ways to register hooks. The location that a hook is registered affects when the hook is run. It's recommended to register the `OpenTelemetryHook` globally in most situations but it's possible to only enable the hook on specific clients. You should **never** register the `OpenTelemetryHook` globally and on a client.

More information on hooks can be found in the [OpenFeature documentation][hook-concept].

### Register Globally

The `OpenTelemetryHook` can be set on the OpenFeature singleton. This will ensure that every flag evaluation will always create a span event, if am active span is available.

```typescript
import { OpenFeature } from '@openfeature/js-sdk';
import { OpenTelemetryHook } from '@openfeature/open-telemetry-hook';

OpenFeature.addHooks(new OpenTelemetryHook());
```

### Register Per Client

The `OpenTelemetryHook` can be set on an individual client. This should only be done if it wasn't set globally and other clients shouldn't use this hook. Setting the hook on the client will ensure that every flag evaluation performed by this client will always create a span event, if am active span is available.

```typescript
import { OpenFeature } from '@openfeature/js-sdk';
import { OpenTelemetryHook } from '@openfeature/open-telemetry-hook';

const client = OpenFeature.getClient('my-app');
client.addHooks(new OpenTelemetryHook());
```

## Development

### Building

Run `nx package hooks-open-telemetry` to build the library.

### Running unit tests

Run `nx test hooks-open-telemetry` to execute the unit tests via [Jest](https://jestjs.io).

[otel-spec]: https://opentelemetry.io/docs/reference/specification/trace/semantic_conventions/feature-flags/
[hook-concept]: https://openfeature.dev/docs/reference/concepts/hooks

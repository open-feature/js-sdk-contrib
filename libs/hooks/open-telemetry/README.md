:warning: This package will be deprecated. Please use the telemetry hooks package from `@openfeature/open-telemetry-hooks`.

# OpenTelemetry Hook

The OpenTelemetry hooks for OpenFeature provide a [spec compliant][otel-spec] way to automatically add feature flag evaluation information to traces and metrics.
Since feature flags are dynamic and affect runtime behavior, it’s important to collect relevant feature flag telemetry signals.
These can be used to determine the impact a feature has on application behavior, enabling enhanced observability use cases, such as A/B testing or progressive feature releases.

## Installation

```
$ npm install @openfeature/open-telemetry-hooks
```

### Peer dependencies

Confirm that the following peer dependencies are installed.

```
$ npm install @openfeature/js-sdk @opentelemetry/api
```

## Hooks

### TracingHook

This hook adds a [span event](https://opentelemetry.io/docs/concepts/signals/traces/#span-events) for each feature flag evaluation.

### MetricsHook

This hook performs metric collection by tapping into various hook stages. Below are the metrics are extracted by this hook:

- `feature_flag.evaluation_requests_total`
- `feature_flag.evaluation_success_total`
- `feature_flag.evaluation_error_total`
- `feature_flag.evaluation_active_count`

## Usage

OpenFeature provides various ways to register hooks. The location that a hook is registered affects when the hook is run.
It's recommended to register both the `TracingHook` and `MetricsHook` globally in most situations, but it's possible to only enable the hook on specific clients.
You should **never** register these hooks both globally and on a client.

More information on hooks can be found in the [OpenFeature documentation][hook-concept].

### Register Globally

The `TracingHook` and `MetricsHook` can both be set on the OpenFeature singleton.
This will ensure that every flag evaluation will always generate the applicable telemetry signals.

```typescript
import { OpenFeature } from '@openfeature/js-sdk';
import { TracingHook } from '@openfeature/open-telemetry-hooks';

OpenFeature.addHooks(new TracingHook());
```

### Register Per Client

 The `TracingHook` and `MetricsHook` can both be set on an individual client. This should only be done if it wasn't set globally and other clients shouldn't use this hook.
 Setting the hook on the client will ensure that every flag evaluation performed by this client will always generate the applicable telemetry signals.

```typescript
import { OpenFeature } from '@openfeature/js-sdk';
import { MetricsHook } from '@openfeature/open-telemetry-hooks';

const client = OpenFeature.getClient('my-app');
client.addHooks(new MetricsHook());
```

## Development

### Building

Run `nx package hooks-open-telemetry` to build the library.

### Running unit tests

Run `nx test hooks-open-telemetry` to execute the unit tests via [Jest](https://jestjs.io).

[otel-spec]: https://opentelemetry.io/docs/reference/specification/trace/semantic_conventions/feature-flags/
[hook-concept]: https://openfeature.dev/docs/reference/concepts/hooks

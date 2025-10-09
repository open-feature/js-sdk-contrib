# OpenTelemetry Hooks

The OpenTelemetry hooks for OpenFeature provide a [spec compliant][otel-semconv] way to automatically add feature flag evaluation information to traces, logs, and metrics.
Since feature flags are dynamic and affect runtime behavior, it’s important to collect relevant feature flag telemetry signals.
These can be used to determine the impact a feature has on application behavior, enabling enhanced observability use cases, such as A/B testing or progressive feature releases.

## Installation

```
$ npm install @openfeature/open-telemetry-hooks
```

### Peer dependencies

Confirm that the following peer dependencies are installed.
If you use the `MetricsHook`, `SpanEventHook` or `SpanHook`, you need to install:

```
$ npm install @openfeature/core @opentelemetry/api
```

For the `EventHook`, you also need to install the OpenTelemetry logs SDK:

```
$ npm install @opentelemetry/sdk-logs
```

> [!NOTE]
> For the hooks to work, you must have the OpenTelemetry SDK configured in your application.
> Please refer to the [OpenTelemetry documentation](https://opentelemetry.io/docs/instrumentation/js/) for more information on setting up OpenTelemetry in your application.
> You need to set up the [tracing SDK][otel-tracing-js] for `SpanHook` and `SpanEventHook`, the [metrics SDK][[otel-metrics-js]] for `MetricsHook`, and the [logs SDK][[otel-logs-js]] for `EventHook`.

## Hooks

### EventHook

This hook logs evaluation events to OpenTelemetry using an [EventLogger][otel-logs].
These are logged even if there is no active span.
This is useful for exporting evaluation events to a backend that supports [OpenTelemetry log events][otel-logs].
**Note:** Log Events are the recommended approach for capturing feature flag evaluation data.

### SpanEventHook

This hook adds evaluation [span events][otel-span-events] to the current active span.
This is useful for associating evaluation events with a trace.
If there is no active span, the event is not logged.
**Note:** [Span events are being deprecated in OTEL][span-event-deprecation-otep] in favor of [using log events via `EventHook`](#eventhook).

### SpanHook

This hook creates a new [span][otel-span] for each flag evaluation and sets the evaluation details as [span attributes][otel-span-attributes].
This is useful for tracing flag evaluations as part of a larger trace.

### MetricsHook

This hook performs metric collection by tapping into various hook stages. Below are the metrics are extracted by this hook:

- `feature_flag.evaluation_requests_total`
- `feature_flag.evaluation_success_total`
- `feature_flag.evaluation_error_total`
- `feature_flag.evaluation_active_count`

## Usage

OpenFeature provides various ways to register hooks. The location that a hook is registered affects when the hook is run.
It's recommended to register the desired hooks globally in most situations, but it's possible to only enable specific hooks on individual clients.
You should **never** register the same hook type both globally and on a client.

More information on hooks can be found in the [OpenFeature documentation][hook-concept].

### Register Globally

The hooks can be set on the OpenFeature singleton.
This will ensure that every flag evaluation will always generate the applicable telemetry signals.

```typescript
import { OpenFeature } from '@openfeature/core';
import { EventHook, MetricsHook } from '@openfeature/open-telemetry-hooks';

OpenFeature.addHooks(new EventHook(), new MetricsHook());
```

### Register Per Client

The hooks can be set on an individual client. This should only be done if they weren't set globally and other clients shouldn't use these hooks.
Setting the hooks on the client will ensure that every flag evaluation performed by this client will always generate the applicable telemetry signals.

```typescript
import { OpenFeature } from '@openfeature/core';
import { SpanHook, MetricsHook } from '@openfeature/open-telemetry-hooks';
import { SpanEventHook } from './tracing-hooks';

const client = OpenFeature.getClient('my-app');
client.addHooks(new SpanEventHook(), new MetricsHook());
```

### Hook Selection Guide

Choose the appropriate hook(s) based on your observability needs:

- **EventHook**: Recommended for future use cases. Logs evaluation events that can be backends supporting [OTEL Logs][otel-logs].
- **SpanEventHook**: Span events are being deprecated. Use only if your backend supports span events and you cannot use `EventHook`.
- **SpanHook**: Use when you want dedicated spans for each evaluation in your traces.
- **MetricsHook**: Use alongside any of the above when you need metrics about evaluation performance.

### Hook Options

All hooks support the following options via `OpenTelemetryHookOptions`:

#### Custom Attributes

Custom attributes can be extracted from hook metadata or evaluation details by supplying an `attributeMapper`:

```typescript
import { HookContext, EvaluationDetails, FlagValue } from '@openfeature/core';
import { EventHook } from '@openfeature/open-telemetry-hooks';

const attributeMapper = (hookContext: HookContext, evaluationDetails: EvaluationDetails<FlagValue>) => ({
  myCustomAttributeFromContext: hookContext.context.targetingKey,
  myCustomAttributeFromMetadata: evaluationDetails.flagMetadata.someFlagMetadataField,
});

const eventHook = new EventHook({ attributeMapper });
```

#### Exclude Attributes

Exclude specific attributes from being added to telemetry events:

```typescript
import { EventHook } from '@openfeature/open-telemetry-hooks';
import { TelemetryAttribute } from '@openfeature/core';

const eventHook = new EventHook({
  excludeAttributes: [TelemetryAttribute.VALUE, 'sensitive_value']
});
```

#### Exclude Exceptions

Prevent exceptions from being recorded:

```typescript
import { SpanHook } from '@openfeature/open-telemetry-hooks';

const spanHook = new SpanHook({ excludeExceptions: true });
```

#### Event Mutation

Transform events before they are emitted:

```typescript
import { EventHook } from '@openfeature/open-telemetry-hooks';

const eventMutator = (event) => ({
  ...event,
  attributes: {
    ...event.attributes,
    environment: 'production'
  }
});

const eventHook = new EventHook({ eventMutator });
```

## Development

### Building

Run `nx package hooks-open-telemetry` to build the library.

### Running unit tests

Run `nx test hooks-open-telemetry` to execute the unit tests via [Jest](https://jestjs.io).

[otel-span]: https://opentelemetry.io/docs/concepts/signals/traces/#spans

[otel-span-attributes]: https://opentelemetry.io/docs/concepts/signals/traces/#attributes

[otel-span-events]: https://opentelemetry.io/docs/concepts/signals/traces/#span-events

[otel-logs]: https://opentelemetry.io/docs/concepts/signals/logs

[otel-semconv]: https://opentelemetry.io/docs/specs/semconv/feature-flags/feature-flags-logs/

[hook-concept]: https://openfeature.dev/docs/reference/concepts/hooks

[span-event-deprecation-otep]: https://github.com/open-telemetry/opentelemetry-specification/blob/fbcd7a3126a545debd9e6e5c69b7b67d4ef1c156/oteps/4430-span-event-api-deprecation-plan.md

[otel-tracing-js]: https://opentelemetry.io/docs/languages/js/instrumentation/#initialize-tracing

[otel-metrics-js]: https://opentelemetry.io/docs/languages/js/instrumentation/#initialize-metrics

[otel-logs-js]: https://opentelemetry.io/docs/languages/js/instrumentation/#logsl

# flagd-js-core

`flagd-js-core` contains the core logic of flagd in-process evaluation provider.
This package is intended to be used by concrete implementations of flagd in-process provider.

## Usage

`flagd-js-core` wraps a simple flagd feature flag storage and flag evaluation logic.

To use this implementation, instantiate a `FlagdJSCore` and provide valid flagd flag configurations.

```typescript
const core = new FlagdJSCore();
core.setConfigurations(FLAG_CONFIGURATION_STRING);
```

Once initialization is complete, use matching flag resolving call.

```typescript
const resolution = core.resolveBooleanEvaluation('myBoolFlag', false, {});
```

# OpenFeature Provider TCK (JavaScript)

A conformance suite any OpenFeature JavaScript provider can adopt to verify that it implements the
provider contract of the specification.

OpenFeature's central promise is that swapping providers does not change application behaviour.
Nothing verifies that today, and every provider tests differently — so "implements the provider
contract" is an unverified claim, and a behavioural difference between two providers is discovered
by the application that trips over it.

This library is the JavaScript implementation of [Appendix F][appendix-f]. It runs the same Gherkin
scenarios, against the same canonical flag set, driven through the same backend control API, as
every other language's TCK. That shared basis is the point: "conformant" only means something if the
question is identical everywhere.

Tracking issue: [open-feature/spec#417][tracking].

## Status

**Proof of concept.** The scenario set is a representative subset covering each architectural
mechanism once, not exhaustive coverage. Breaking changes should be expected.

## Adopting it

One call in one `.spec.ts` file. It uses **jest-cucumber**, the same runner the flagd provider suite
already uses, so an adopting library gains no new test framework.

```ts
import { Capability, runProviderTck } from '@openfeature/provider-tck';

const control = new MyBackendControl();

runProviderTck({
  name: 'my-provider',
  control,
  newProvider: () => new MyProvider(control.address),
  capabilities: [Capability.Events, Capability.Object],
});
```

The TCK owns the whole lifecycle: registering the provider under a suite-scoped domain, awaiting
events, resetting the backend between scenarios, closing it at the end. **If you find yourself
writing test infrastructure, that is a defect here rather than something for you to work around.**

Every scenario becomes a Jest test, so `-t` selects one and failures name a scenario.

> **One suite per file.** jest-cucumber accumulates step definitions in module state, so two
> `runProviderTck` calls in the same file would register the vocabulary twice and every step would
> report as ambiguous. Two resolvers means two spec files.

### Timings

`eventTimeoutMs` is the knob that matters. Providers observe backend changes on wildly different
timescales — a streaming provider sees a configuration change in milliseconds, one that polls every
30 seconds may need most of a poll interval. Set it to comfortably exceed your worst-case detection
latency, or the suite reports timeouts that are really just impatience.

## Capabilities

Not every provider implements every optional part of the contract. Each scenario exercising an
optional part carries a Gherkin tag, and a provider declares what it supports.

**A scenario whose capability was not declared is reported as skipped, with the reason in the test
name — never as passed.** A conformance suite that quietly goes green on scenarios it did not run is
worse than no suite at all:

```
○ skipped Losing the backend makes the provider stale... — SKIPPED: provider does not declare @stale
```

That works because jest-cucumber marks tag-filtered scenarios `skippedViaTagFilter` and turns them
into `test.skip` rather than omitting them, so they stay visible in the report.

| Capability | Tag | Meaning |
| --- | --- | --- |
| `Capability.Events` | `@events` | emits lifecycle events at all |
| `Capability.Stale` | `@stale` | enters `STALE` and emits `PROVIDER_STALE` on backend loss |
| `Capability.ConfigurationChange` | `@configuration-change` | detects configuration changes and emits `PROVIDER_CONFIGURATION_CHANGED` |
| `Capability.Object` | `@object` | supports structured flag values |
| `Capability.UnavailableInit` | `@unavailable` | reports an error state instead of hanging against a dead backend |
| `Capability.StrictNumericTyping` | `@strict-numeric-typing` | does not coerce between integer and float — **see below** |
| `Capability.Targeting` | `@targeting` | reserved; no scenarios yet |
| `Capability.Caching` | `@caching` | reserved; no scenarios yet |

Untagged scenarios are mandatory and always run. `capabilities` defaults to everything — narrow it
rather than widening it.

## The one place JavaScript cannot answer the shared question

`@strict-numeric-typing` asserts that a provider reports `TYPE_MISMATCH` rather than silently
narrowing `0.5` to `0` when a float flag is requested as an integer. In Go, Java and Python that is a
real question with a right answer.

**JavaScript has no integer type.** `typeof 10` and `typeof 0.5` are both `'number'`, the Evaluation
API exposes only `getNumberDetails`, and the in-memory provider type-checks with
`typeof value != typeof defaultValue`. Requesting `float-flag` as an Integer is therefore
*indistinguishable* from requesting it as a Float, and **no provider in this language can satisfy
that scenario** — not because of a defect, but because the distinction does not exist.

So every JavaScript suite leaves the capability undeclared, and the scenario is reported as skipped.
That is the honest outcome, but it is worth flagging upstream: the capability's meaning is
language-dependent in a way the specification does not currently acknowledge. Raised on
[spec#417][tracking].

## Controlling the backend

`BackendControl` is the single seam between the scenarios and whatever manipulates the backend. Step
definitions never talk to a backend directly, which is why the same Gherkin runs unchanged against a
containerised backend and against a provider manipulated in-process.

**If your provider talks to a backend, drive it over the HTTP control API** in
[`openapi/control-api.yaml`](./openapi/control-api.yaml). That API is the normative contract for
those providers, and it is what makes a conformance claim portable: another language's TCK drives
the same endpoints against the same stack and must get the same answers.

Two of its requirements are easy to get wrong:

- **Containers are never stopped or restarted mid-suite.** Unavailability is simulated *inside* the
  running stack. Container orchestrators assign host ports dynamically and cannot reliably preserve
  them across a restart, so restarting silently invalidates every provider already pointed at the
  old port, and the failure looks like a flaky provider.
- **`/start` resets flag state; `/restart` preserves it.** An outage must be observable as a change
  in availability, never as a change in flag values.

### Providers with no backend

An in-memory, environment-variable or file-based provider has nothing to connect to. Those may
control the backend in-process; `InProcessControl` is the reference.

This is a narrow allowance and the obvious thing to abuse. **A provider with an external backend
must use the control API.** Reaching into an external backend from inside the test process — a
test-only admin client, a shared database handle, a hook inside the provider — produces a suite that
passes while proving nothing.

Connection-dependent scenarios have no meaning without a connection, so a backend-less control simply
does not implement `ConnectionControl`, leaves `Stale` and `UnavailableInit` undeclared, and those
scenarios are skipped with their reason.

## The self-tests

| Suite | Subject | Why |
| --- | --- | --- |
| `inMemory.spec.ts` | the SDK's `InMemoryProvider` | reference adoption for a backend-less provider, and the Docker-free canary |
| `multiProvider.spec.ts` | `MultiProvider` wrapping one child | delegation must be transparent |
| `inProcessControl.spec.ts` | `InProcessControl` | pins what the Gherkin cannot assert about itself |

`multiProvider.spec.ts` wraps exactly one child deliberately. That is the interesting configuration
rather than a degenerate one: the correct answer is precisely what the in-memory suite already
asserts about the child alone, so any difference is attributable to the multi-provider and nothing
else — a variant that does not survive the hop, a reason rewritten to `DEFAULT`, an error code
flattened to `GENERAL`, an event that never reaches the client. The Java equivalent found a real bug
this way ([java-sdk#1882](https://github.com/open-feature/java-sdk/issues/1882)).

## A note in JavaScript's favour

The Go and Python SDKs' in-memory providers cannot update their flag set or emit
`PROVIDER_CONFIGURATION_CHANGED`, which [Appendix A][appendix-a] requires
([go-sdk#530](https://github.com/open-feature/go-sdk/issues/530),
[python-sdk#620](https://github.com/open-feature/python-sdk/issues/620)). JavaScript's has
`putConfiguration` and emits the event, so this TCK needs no wrapper class and the in-memory suite
declares `ConfigurationChange` directly. It is the reference behaviour the other two should grow.

## Known gaps

- **The features are read from a workspace-relative path**, matching `getGherkinTestPath` in
  `@openfeature/flagd-core`. That works for consumers inside this Nx workspace, which is every
  current adopter, but an external npm consumer would need the packaged copy instead. Worth
  revisiting when one exists.
- **The assets are vendored, not submoduled.** `features/`, `flags/` and `openapi/` are copies of
  `specification/assets/provider-tck/` in [open-feature/spec][spec]. Changes belong there.
- **No HTTP control client yet** — it arrives with the first containerised adopter.
- **Evaluation context passthrough is unverifiable** without an echo operation on the control API.
- Caching, hooks and flag metadata are not covered.

[appendix-a]: https://github.com/open-feature/spec/blob/main/specification/appendix-a-included-utilities.md
[appendix-f]: https://github.com/open-feature/spec/blob/main/specification/appendix-f-provider-conformance.md
[spec]: https://github.com/open-feature/spec
[tracking]: https://github.com/open-feature/spec/issues/417

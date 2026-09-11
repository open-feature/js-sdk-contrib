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

The feature files, canonical flag set and control-API document are **packaged with the library** and
located relative to this module rather than to the working directory, so **adopting the TCK requires
no git submodule and no particular repository layout** — `npm install` is the whole setup. The same
code path works whether you consume the library from npm or from inside this workspace.

Contributors to this repository *do* need the submodule, because in-tree the artifacts are read
straight out of [open-feature/spec][spec] rather than copied. See [Where the artifacts come
from](#where-the-artifacts-come-from).

> **One suite per file.** jest-cucumber accumulates step definitions in module state, so two
> `runProviderTck` calls in the same file would register the vocabulary twice and every step would
> report as ambiguous. Two resolvers means two spec files.

### Timings

`eventTimeoutMs` is the knob that matters. Providers observe backend changes on wildly different
timescales — a streaming provider sees a configuration change in milliseconds, one that polls every
30 seconds may need most of a poll interval. Set it to comfortably exceed your worst-case detection
latency, or the suite reports timeouts that are really just impatience.

## Extending the suite

A vendor usually has behaviour outside the shared contract — flagd's `fractional` targeting is the
motivating example. Those scenarios cannot go in the canonical feature files, because they are not
part of what every provider implements, but running them in a **parallel harness** means
reimplementing the provider lifecycle and the backend reset, and then watching them drift.

So the suite takes them:

```ts
import { join } from 'node:path';
import type { StepDefinitions } from 'jest-cucumber';

const vendorSteps: StepDefinitions = ({ given }) => {
  given(/^a fractional rule splitting "([^"]*)" (\d+)\/(\d+)$/, async (key, a, b) => { /* ... */ });
};

runProviderTck({
  name: 'my-provider',
  control,
  newProvider: () => new MyProvider(control.address),
  extensionFeatures: join(__dirname, 'extension-features'),
  extensionSteps: vendorSteps,
});
```

Both are optional, and omitting them gives exactly the run you get today. What you get by supplying
them is one suite: the same `describe`, the same provider lifecycle, the same per-scenario backend
reset, the same capability gate. An extension scenario uses the canonical steps freely and needs
`extensionSteps` only for words the canonical vocabulary does not have.

`extensionFeatures` takes a directory (every `.feature` file directly in it, sorted) or a single
file, or a list of either. Paths resolve against the runner's working directory rather than your
test file's, so pass absolute ones.

Two rules are enforced rather than documented, because without them the Java prototype let a
same-named extension file *replace* a canonical one — the suite went green having run the adopter's
version of a canonical scenario:

- an extension feature may not be named after a canonical one (`errors`, `evaluation`, `events`,
  `lifecycle`), and belongs in a directory of its own;
- an extension feature may not live inside the canonical asset directory.

A step matcher that also matches a canonical step is rejected by jest-cucumber as ambiguous, so an
extension cannot redefine what a canonical step means either.

The canonical features are loaded unconditionally and first, so no extension wiring can keep one out
of the run. An extension scenario carries no weight in a conformance claim: it is the adopter's own
question, run in the adopter's own suite.

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

The reason is composed by the harness rather than by jest-cucumber's `scenarioNameTemplate`, which
does not reach far enough: the template is applied to a Scenario Outline's own title, and each
example row is then defined under its *expanded* title instead, so a skipped example row showed no
reason at all — four rows of `errors.feature` whenever `@object` is undeclared. jest-cucumber accepts
the `describe`/`test` pair it calls, so the harness supplies one and names the skip at the point the
call is made. See [`src/lib/scenarioRunner.ts`](./src/lib/scenarioRunner.ts).

| Capability | Tag | Meaning |
| --- | --- | --- |
| `Capability.Events` | `@events` | emits lifecycle events at all |
| `Capability.Lifecycle` | `@lifecycle` | performs an initialisation that reaches its backend, with an observable outcome — **see below** |
| `Capability.Stale` | `@stale` | enters `STALE` and emits `PROVIDER_STALE` on backend loss |
| `Capability.ConfigurationChange` | `@configuration-change` | detects configuration changes and emits `PROVIDER_CONFIGURATION_CHANGED` |
| `Capability.Object` | `@object` | supports structured flag values |
| `Capability.UnavailableInit` | `@unavailable` | reports an error state instead of hanging against a dead backend |
| `Capability.NumericCoercion` | `@numeric-coercion` | coerces between integer and float only when lossless, else `TYPE_MISMATCH` — **see below** |
| `Capability.Targeting` | `@targeting` | reserved; **not declarable** — no scenarios yet |
| `Capability.Caching` | `@caching` | reserved; **not declarable** — no scenarios yet |

Untagged scenarios are mandatory and always run. `capabilities` defaults to every *declarable*
capability — narrow it rather than widening it.

A **reserved** capability is a name held open for a scenario nobody has written yet. No scenario
carries `@targeting` or `@caching`, so declaring one cannot cause a skip: it says nothing about the
provider, plays no part in reading the results, and only invites a reader to believe something was
verified when nothing examined it. They are excluded from the default, and naming one in
`capabilities` or `notApplicable` is **rejected** rather than quietly dropped:

```
capabilities or notApplicable names @targeting, which no scenario carries. @targeting and @caching
are reserved names held open for scenarios that do not exist yet: declaring one cannot cause a skip,
so it says nothing about this provider and would invite a report's reader to believe it was verified.
```

This is not a hypothetical tidy-up. A published Java conformance report asserts both as declared —
not by anyone's decision, but because that adoption declares "every capability except X" and picks
up every reserved tag in the vocabulary on the way past. Rejecting is louder than warning on
purpose: a console line competes with Jest's own output and is invisible in the log of a green CI
build, and the fix is a one-line edit.

Which capabilities are reserved is decided upstream, in Appendix F, and recorded here in
`RESERVED_CAPABILITIES`. The harness checks that list against the feature files it actually ran and
fails if a reservation has expired — a scenario arriving upstream is what makes a capability
declarable, and an out-of-date list would go on making a testable capability unclaimable.

A capability whose question cannot be put to your provider *at all* goes in `notApplicable` instead
of simply being left out, with the reason it cannot. In JavaScript that is `@numeric-coercion`,
and the distinction is the subject of the next section.

### `@lifecycle` is not `@events`

Provider initialisation used to be gated by `@events`, which was wrong in both directions.

A stateless provider — OFREP, or anything evaluating over a request-scoped call — cannot declare
`@events`, yet it may well have a real initialisation whose outcome is worth asserting. It was
locked out of scenarios that were never about events.

The reverse case is worse, because it goes green. **Every SDK synthesises `PROVIDER_READY` for a
provider with no initialisation step**, so a provider that declares `@events` but does nothing on
startup passes the readiness scenario without demonstrating anything — a `NoOpProvider` passes it
identically. Declare `@lifecycle` only if initialisation genuinely contacts your backend and both
terminal outcomes are observable: READY against a healthy backend, ERROR against an unreachable one.

## The one place JavaScript cannot answer the shared question

`@numeric-coercion` has two halves: a provider must resolve a coercion that loses nothing — `10.0`
asked for as an integer — and must report `TYPE_MISMATCH` for one that does not, rather than
silently narrowing `0.5` to `0`. The rule is flagd's [numeric coercion ADR][coercion-adr], and the
tag was called `@strict-numeric-typing` until it was renamed to match. In Go, Java and Python this is
a real question with a right answer.

**JavaScript has no integer type.** `typeof 10` and `typeof 0.5` are both `'number'`, the Evaluation
API exposes only `getNumberDetails`, and the in-memory provider type-checks with
`typeof value != typeof defaultValue`. Requesting `float-flag` as an Integer is therefore
*indistinguishable* from requesting it as a Float, so **neither half can be put to a provider in
this language**: there is no lossless coercion to permit, because `10.0` and `10` are the same value
and nothing is narrowed, and no lossy one to reject, because `0.5` asked for as an Integer is
indistinguishable from a valid Float request. Not a defect — the distinction does not exist here.

Only the lossy half has a scenario at all, in any language. The canonical flag set holds no integral
float to ask the other half of, and adding one changes the flag set for every language at once, so a
provider that wrongly rejects `10.0` as an integer still passes. Appendix F records that as an open
gap, along with a second one: the width of a language's integer accessor is not modelled, which is
what flagd's testbed tags `@int32-bounded`.

So every JavaScript suite leaves the capability out of `capabilities` — but **not** by silently
omitting it. "This provider has not implemented X" and "X cannot be asked of this provider at all"
are different claims, and collapsing them would report every JavaScript provider as missing
something none of them can have. A suite says which it means:

```ts
runProviderTck({
  // ...
  capabilities: [Capability.Events, Capability.ConfigurationChange, Capability.Object],
  notApplicable: { [Capability.NumericCoercion]: NO_INTEGER_TYPE_IN_JAVASCRIPT },
});
```

The reason is required, because a reader has no other way to tell an impossibility from an excuse.
`NO_INTEGER_TYPE_IN_JAVASCRIPT` is exported for this one: it is a fact about the language rather
than about any provider, and one sentence shared between adoptions compares better than two
paraphrases of it.

Gating is identical either way — the scenarios are skipped with the reason in the test name — so
this changes what is *declared*, not what runs:

```
○ skipped A float flag is not silently narrowed to an integer — NOT APPLICABLE: @numeric-coercion does not apply to this provider
```

Use it only where the capability is unsatisfiable in principle; a provider that simply has not
implemented something should leave it out of `capabilities` instead. Listing a capability in both is
rejected.

The capability's meaning being language-dependent is worth flagging upstream regardless, since the
specification does not currently acknowledge it. Raised on [spec#417][tracking].

## Controlling the backend

`BackendControl` is the single seam between the scenarios and whatever manipulates the backend. Step
definitions never talk to a backend directly, which is why the same Gherkin runs unchanged against a
containerised backend and against a provider manipulated in-process.

**If your provider talks to a backend, drive it over the HTTP control API** in
[`control-api.yaml`](./spec/specification/assets/provider-tck/openapi/control-api.yaml). That API is
the normative contract for those providers, and it is what makes a conformance claim portable:
another language's TCK drives the same endpoints against the same stack and must get the same
answers.

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
does not implement `ConnectionControl`, leaves `Stale`, `UnavailableInit` and `Lifecycle`
undeclared, and those scenarios are skipped with their reason. `Lifecycle` belongs in that list for
the same reason as the other two: there is no backend for initialisation to reach.

## The self-tests

| Suite | Subject | Why |
| --- | --- | --- |
| `inMemory.spec.ts` | the SDK's `InMemoryProvider` | reference adoption for a backend-less provider, and the Docker-free canary |
| `extensionSuite.spec.ts` | the same provider, plus `fixtures/extension-features` | reference adoption for a vendor with scenarios of its own, and the proof they share one lifecycle with the canonical set |
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

## Where the artifacts come from

The feature files, the canonical flag set and the control-API document are **not owned by this
repository**. They are the language-agnostic artifacts under `specification/assets/provider-tck/` in
[open-feature/spec][spec], consumed here through a git submodule at `spec/` and **never copied**: a
copy would be a second place for the definition of conformance to drift, which is the one thing this
suite exists to prevent. Changes to them belong upstream.

The two audiences are deliberately different:

- **Adopters need no submodule.** `nx package` copies the artifacts out of the submodule and into
  the published library, so an `npm install` of `@openfeature/provider-tck` is self-contained.
- **Contributors do.** Working on the TCK in this repository means the assets are read straight out
  of the submodule, so a checkout without it cannot load any feature file:

  ```sh
  git submodule update --init libs/shared/provider-tck/spec
  ```

  `nx test provider-tck` and `nx package provider-tck` depend on the `pullSpec` target, which runs
  that for you. CI checks out with `submodules: recursive`.

Prettier is pointed away from `spec/` so it never rewrites artifacts that are consumed byte for byte
by every language's TCK.

## Known gaps

- **No HTTP control client yet** — it arrives with the first containerised adopter.
- **Evaluation context passthrough is unverifiable** without an echo operation on the control API.
- Caching, hooks and flag metadata are not covered.

[appendix-a]: https://github.com/open-feature/spec/blob/main/specification/appendix-a-included-utilities.md
[coercion-adr]: https://github.com/open-feature/flagd/blob/main/docs/architecture-decisions/numeric-coercion.md
[appendix-f]: https://github.com/open-feature/spec/blob/main/specification/appendix-f-provider-conformance.md
[spec]: https://github.com/open-feature/spec
[tracking]: https://github.com/open-feature/spec/issues/417

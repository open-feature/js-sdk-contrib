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
reimplementing the provider lifecycle, the backend reset and the report, and then watching it drift.

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
reset, the same capability gate, the same report. An extension scenario uses the canonical steps
freely and needs `extensionSteps` only for words the canonical vocabulary does not have.

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

In the report, an extension scenario is named under the `extensions/` URI prefix while a canonical
one keeps its path in [open-feature/spec][spec]. That is what a report consumer reads to tell them
apart, and it is why extension scenarios do not count towards conformance.

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
| `Capability.StrictNumericTyping` | `@strict-numeric-typing` | does not coerce between integer and float — **see below** |
| `Capability.Targeting` | `@targeting` | reserved; no scenarios yet |
| `Capability.Caching` | `@caching` | reserved; no scenarios yet |

Untagged scenarios are mandatory and always run. `capabilities` defaults to everything — narrow it
rather than widening it.

A capability whose question cannot be put to your provider *at all* goes in `notApplicable` instead
of simply being left out, with the reason it cannot. In JavaScript that is `@strict-numeric-typing`,
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

`@strict-numeric-typing` asserts that a provider reports `TYPE_MISMATCH` rather than silently
narrowing `0.5` to `0` when a float flag is requested as an integer. In Go, Java and Python that is a
real question with a right answer.

**JavaScript has no integer type.** `typeof 10` and `typeof 0.5` are both `'number'`, the Evaluation
API exposes only `getNumberDetails`, and the in-memory provider type-checks with
`typeof value != typeof defaultValue`. Requesting `float-flag` as an Integer is therefore
*indistinguishable* from requesting it as a Float, and **no provider in this language can satisfy
that scenario** — not because of a defect, but because the distinction does not exist.

So every JavaScript suite leaves the capability out of `capabilities` — but **not** by silently
omitting it. "This provider has not implemented X" and "X cannot be asked of this provider at all"
are different claims, and collapsing them would report every JavaScript provider as missing
something none of them can have. A suite says which it means:

```ts
runProviderTck({
  // ...
  capabilities: [Capability.Events, Capability.ConfigurationChange, Capability.Object],
  notApplicable: { [Capability.StrictNumericTyping]: NO_INTEGER_TYPE_IN_JAVASCRIPT },
});
```

The reason is required, because a reader of the report has no other way to tell an impossibility
from an excuse. `NO_INTEGER_TYPE_IN_JAVASCRIPT` is exported for this one: it is a fact about the
language rather than about any provider, and one sentence shared between reports compares better
than two paraphrases of it.

Gating is identical either way — the scenarios are skipped with the reason in the test name — so
this changes what is *declared*, not what runs:

```
○ skipped A float flag is not silently narrowed to an integer — NOT APPLICABLE: @strict-numeric-typing does not apply to this provider
```

and the [conformance report](#conformance-reports) carries the capability in
`declaration.notApplicable` with that reason rather than leaving it silently absent. Use it only
where the capability is unsatisfiable in principle; a provider that simply has not implemented
something should leave it out of `capabilities` instead. Listing a capability in both is rejected.

The capability's meaning being language-dependent is worth flagging upstream regardless, since the
specification does not currently acknowledge it. Raised on [spec#417][tracking].

## Conformance reports

Set `PROVIDER_TCK_REPORT_DIR` and each suite writes two files: an envelope at `<dir>/<name>.json`,
conforming to the [report schema][report-schema] in the specification, and the results it points at
at `<dir>/<name>.ndjson`.

**The results are [Cucumber Messages][messages], not a format this project defines.** Per-scenario
outcomes, tags, Scenario Outline row identity and the executed feature source are all specified
there already, and specifying them again would mean a second format to version and two places for
the same fact to disagree. The envelope carries only what Messages has no opinion about: what was
tested, and what the provider claims.

```console
$ PROVIDER_TCK_REPORT_DIR=./reports npx jest
$ jq -r 'select(.testStepFinished).testStepFinished.testStepResult.status' reports/in-memory.ndjson \
    | sort | uniq -c
     24 PASSED
      5 SKIPPED
```

It is an environment variable rather than a `TckOptions` field so that emitting a report is a
property of the *run* and not of the code: CI sets it, a developer running the suite locally does
not, and no adopter changes a line to publish one. Unset means no report, which is not an error.
Several suites in one run each write their own pair of files, so flagd's two resolvers do not
collide. The stream is written first and the envelope second, carrying a `sha256` digest of it, so
an envelope never names results that are not there or have moved on.

**Every scenario appears exactly once**, whatever its outcome: one `Pickle`, one `TestCase` and one
`TestCaseStarted`/`TestStepFinished`/`TestCaseFinished`, including for every scenario the capability
gate skipped. That is what makes Appendix F's rule — a scenario skipped for an undeclared capability
is reported as skipped and *never* as passed — checkable by a consumer rather than dependent on the
runner's summary being trustworthy. The harness checks the accounting itself at the end of every
run, report or no report, and fails the suite if a scenario is missing or recorded twice.

**The canonical scenarios must also have actually run.** The accounting above proves the report has
an entry per scenario; it does not prove the run produced those entries, because a scenario is
registered when it is *defined* and one the runner declines to run carries a placeholder failure
instead. So a filtered run — `jest -t`, a `testPathIgnorePatterns` entry, a mistake in the extension
wiring — satisfies the accounting and goes green while its report supports nothing. The harness
therefore fails the suite unless every canonical scenario reached a decision. A capability skip is a
decision and passes the check; extension scenarios are excluded from it, because which of their own
scenarios an adopter runs is the adopter's business.

Working on one scenario with `-t` therefore ends in a failed suite. That is the intended cost: the
alternative is a green run that cannot be told apart from a complete one.

### Reading the stream

| Question | Where the answer is |
| --- | --- |
| what was in the suite | one `Pickle` per scenario, one `TestCase` per pickle |
| what the outcome was | `TestStepFinished.testStepResult.status` |
| why it was skipped | `TestStepFinished.testStepResult.message` |
| what tags it carried | `Pickle.tags`, `Examples`-block tags included |
| which row of an outline | `Pickle.astNodeIds` — the second id is the `TableRow` in the `GherkinDocument` |
| what was actually executed | `Source`, verbatim |

The eleven rows of `errors.feature`'s type-mismatch matrix are the case that matters. They share a
scenario name, and they share their *expanded* name too, because that outline's title has no
placeholders in it — so nothing but the AST node identifies them:

```console
$ jq -r 'select(.pickle) | select(.pickle.name | test("wrong type")) | .pickle.astNodeIds | @tsv' \
    reports/in-memory.ndjson
25      9
25      10
25      11
...
```

`25` is the `Scenario Outline`, and the second id is the row: `jq` the `GherkinDocument` for it and
its cells come back. No separator, ordering or escaping rule has to be agreed between four
languages for that to work, which is what a naming convention would have required.

**jest-cucumber has no output layer at all** — no reporter, no JSON, nothing. The stream is
therefore built by the harness, and two things it already did make that cheap rather than painful.
It plans every scenario before the run, which is where the `Pickle` and `TestCase` messages come
from; and it owns the `test`/`test.skip` calls, which is where the outcomes are recorded, at the
point the decision is made rather than scraped back out of a reporter. `@cucumber/gherkin` compiles
the `Source`, `GherkinDocument` and `Pickle` messages from the feature files, so no message here is
hand-rolled and no id is invented.

A scenario is registered when it is *defined*, so one Jest never finished — a timeout, or a `-t`
filter — still appears, as a failure that says so. **A report from a filtered run is partial by
construction**, and the canonical-coverage check above fails the suite rather than leaving that to
be noticed.

**One `TestStep` per test case, not one per Gherkin step.** jest-cucumber runs a whole scenario as a
single Jest test and reports one outcome for it; it never says which step failed. A step per Gherkin
step would mean inventing per-step results to fill in — marking them all failed over-claims, and
marking one of them failed picks a step at random — so the stream carries the granularity the runner
actually has. The steps themselves are in the stream on the `Pickle`, with the outline row already
substituted into them, and jest-cucumber's failure message names the step it was on.

**A gated scenario is `SKIPPED`, whichever kind of skip it was**, with the reason on the result. The
difference between a capability the provider declined and one that cannot hold for it at all is not
a status, because a status a consumer has to special-case is a status something reads as a pass. It
is in the envelope's declaration, where it belongs: it is a fact about the provider rather than
about the run.

### Reading the envelope

- **`provider.name` is what the provider reports through its own metadata**, not the suite name. The
  suite name is chosen to read well in a failure message — `flagd-rpc` — which makes it the
  *configuration*, and it is reported as such. One provider with two materially different modes
  produces two reports that are not interchangeable.
- **`declaration` is an input to reading the results, not a summary of them.** A skipped test case
  says the question was not put to this provider; only the declaration says whether that is because
  the provider declines the capability (`declared` does not list it) or because the capability
  cannot hold for it at all (`notApplicable`, with the reason). Given the declaration and a
  scenario's tags, the reason for any skip follows without being transported per scenario.
- **`tck.specRevision`** comes from [`src/lib/revision.ts`](./src/lib/revision.ts), which
  [`scripts/write-revision.js`](./scripts/write-revision.js) generates from the submodule. It is
  captured at build time because the submodule is not part of the published npm package. Nothing
  else about the artifacts needs asserting: the stream carries every executed feature file verbatim
  as a `Source`, which identifies them by content, covers only what ran, and is under the digest.
- **`backend.controlApi`** reports how the backend was driven. It is an optional member of
  `BackendControl`, so adding it broke no existing implementation; a control that omits it omits the
  field, which claims nothing either way.

There is no per-capability verdict in the report, and that is deliberate. A roll-up is derivable
from the declaration and the stream, and a consumer computing one should count only test cases that
*ran*: `@targeting` is reserved and no scenario carries it, and every scenario carrying a capability
can be skipped for a *different* one — both scenarios in `events.feature` carry `@events` as well as
`@stale` or `@configuration-change` — so counting tag presence rather than execution reports a green
result for a question nobody asked. Nor is a capability roll-up a conformance verdict in the first
place: scenarios carrying no capability tag are mandatory and roll up into nothing, so a provider
can fail a mandatory scenario with every capability intact.

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

`pullSpec` also regenerates [`src/lib/revision.ts`](./src/lib/revision.ts) from the submodule, so
the revision a conformance report names is refreshed by the same command that checks the artifacts
out. That file is committed, because a plain `jest` invocation does not go through Nx and a source
tree without git should still compile; if git or the submodule is unavailable the generator says so
and leaves the committed values alone rather than overwriting them with a guess.

Prettier is pointed away from `spec/` so it never rewrites artifacts that are consumed byte for byte
by every language's TCK.

## Known gaps

- **No HTTP control client yet** — it arrives with the first containerised adopter.
- **Evaluation context passthrough is unverifiable** without an echo operation on the control API.
- Caching, hooks and flag metadata are not covered.

[appendix-a]: https://github.com/open-feature/spec/blob/main/specification/appendix-a-included-utilities.md
[messages]: https://github.com/cucumber/messages
[report-schema]: https://github.com/open-feature/spec/blob/main/specification/assets/provider-tck/report/conformance-report.schema.json
[appendix-f]: https://github.com/open-feature/spec/blob/main/specification/appendix-f-provider-conformance.md
[spec]: https://github.com/open-feature/spec
[tracking]: https://github.com/open-feature/spec/issues/417

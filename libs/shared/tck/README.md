# OpenFeature Provider TCK (JavaScript)

A conformance suite any OpenFeature JavaScript provider can adopt to verify that it implements the
provider contract of the specification.

It is the JavaScript implementation of [Appendix F][appendix-f], which defines the scenarios, the
canonical flag set, the control API and the capability vocabulary every language's TCK shares.
**Read it for anything true of the suite rather than of this package.** Tracking issue:
[open-feature/spec#417][tracking].

**Status: proof of concept.** The scenario set covers each mechanism once rather than exhaustively;
expect breaking changes.

## Quick start

One call in one `.spec.ts` file. The suite owns the lifecycle — provider registration, event waits,
the per-scenario backend reset, teardown — so **if you find yourself writing test infrastructure,
that is a defect here.**

### A provider with a backend

Name a Compose file, say which container-internal ports the provider connects to, and build a
provider from the endpoint the suite discovers:

```ts
import { join } from 'node:path';
import { Capability, runContainerizedProviderTck } from '@openfeature/tck';

runContainerizedProviderTck({
  name: 'my-provider',
  composeFile: join(__dirname, 'docker-compose.yaml'),
  backendPorts: [8013],
  newProvider: (endpoint) => new MyProvider({ host: endpoint.host, port: endpoint.port(8013) }),
  newUnavailableProvider: () => new MyProvider({ host: 'localhost', port: 9999 }),
  capabilities: [Capability.Events, Capability.Object],
});
```

That is the whole adoption. `testcontainers` is an **optional peer dependency** loaded on first use,
so install it — `npm i -D testcontainers` — if you use this entry point.

### A provider with no backend

An in-memory, environment-variable or file-based provider supplies its own `BackendControl` instead
of a Compose file; `InProcessControl` is the reference. A provider that _does_ have a backend drives
it through the control API instead.

```ts
import { Capability, InProcessControl, runProviderTck } from '@openfeature/tck';

const control = new InProcessControl();

runProviderTck({
  name: 'my-provider',
  control,
  newProvider: () => control.newProvider(),
  capabilities: [Capability.ConfigurationChange, Capability.Object],
});
```

Every scenario becomes a Jest test, so a failure names a scenario. The feature files, flag set and
control-API document are **packaged with the library**: adoption needs no submodule.

> **One suite per file.** jest-cucumber accumulates step definitions in module state, so a second
> `runProviderTck` call in one file would make every step ambiguous. Two resolvers means two spec
> files; the second call is refused.

## Options

### `runProviderTck`

| option                   | default        | what it is                                               |
| ------------------------ | -------------- | -------------------------------------------------------- |
| `name` **(req)**         | —              | suite name; the _configuration_ in a report              |
| `newProvider` **(req)**  | —              | builds the provider, once per scenario                   |
| `control` **(req)**      | —              | the `BackendControl` the steps drive                     |
| `newUnavailableProvider` | —              | a provider pointed at a dead backend, for `@unavailable` |
| `capabilities`           | all declarable | what this provider supports; narrow it, do not widen     |
| `knownDeviations`        | none           | requirements this provider is known to fail              |
| `extensionFeatures`      | —              | vendor features: a directory, a file, or a list          |
| `extensionSteps`         | —              | steps for words the canonical vocabulary lacks           |
| `eventTimeoutMs`         | `12000`        | time to observe a backend change                         |
| `readyTimeoutMs`         | `30000`        | time to reach `READY`                                    |

`eventTimeoutMs` is the knob that matters: set it to comfortably exceed your provider's worst-case
detection latency, or the suite reports timeouts that are really impatience.

### `runContainerizedProviderTck`

Every `runProviderTck` option except `control`, which the suite builds, plus:

| option                   | default     | what it is                                            |
| ------------------------ | ----------- | ----------------------------------------------------- |
| `composeFile` **(req)**  | —           | path to the Compose file; pass an absolute one        |
| `backendPorts` **(req)** | —           | container-internal ports the **provider** connects to |
| `newProvider` **(req)**  | —           | builds the provider from a `BackendEndpoint`          |
| `backendService`         | `'backend'` | the service hosting the control API and the backend   |
| `controlPort`            | `8080`      | container-internal port of the control API            |
| `additionalPorts`        | `{}`        | extra service → ports, for a multi-service stack      |
| `backendConfiguration`   | `'default'` | the backend configuration passed to `POST /start`     |
| `startupTimeoutMs`       | `60000`     | budget for the stack to become reachable              |

`backendConfiguration` names the **backend's** configuration, not the provider's — `name` is what
feeds a report's `provider.configuration`. (Worth keeping apart in the spelling: three of the four
languages had taken the bare word `configuration` for the backend's, so it meant opposite things
depending on which suite you were reading.)

The Compose file must **not pin host ports**: the suite discovers the mapped ones after startup, and
the control port is mapped for you — listing it in `backendPorts` is refused. Ports are resolved
only where declared, and an undeclared one names the option to edit. The stack starts once and is
never restarted; `startupTimeoutMs` counts from `docker compose up`, so on a cold machine it
includes the image pull.

### Writing a control

**From a Compose file you write no control at all.** Otherwise `HttpControl` drives the
[control API](./spec/specification/assets/provider-tck/openapi/control-api.yaml) over the global
`fetch`, preferring `POST /reset` and falling back to `POST /start?config=default` on a `404` or
`501`. Its base URL is a **thunk** (`{ baseUrl: () => url }`), since a control port is usually mapped
dynamically and does not exist until the stack is up, whereas `runProviderTck` runs at module load.
Any control must state **`controlApi`** — `'http'` or `'in-process'` — which is not inferred.

## Declaring capabilities

Each scenario exercising an optional part of the contract carries a Gherkin tag, and a provider
declares what it supports (each name below is a member of `Capability`):

| Capability            | Tag                     | Meaning                                                      |
| --------------------- | ----------------------- | ------------------------------------------------------------ |
| `Events`              | `@events`               | emits lifecycle events at all                                |
| `Lifecycle`           | `@lifecycle`            | initialises for real, both outcomes observable               |
| `Reinitialization`    | `@reinitialization`     | can be initialised again after `shutdown` (2.5.2 permits it) |
| `Stale`               | `@stale`                | enters `STALE` and emits `PROVIDER_STALE` on backend loss    |
| `ConfigurationChange` | `@configuration-change` | emits `PROVIDER_CONFIGURATION_CHANGED`                       |
| `Object`              | `@object`               | supports structured flag values                              |
| `Variants`            | `@variants`             | names the variant it resolved (2.2.4, a `SHOULD`)            |
| `DisabledFlags`       | `@disabled-flags`       | resolves a disabled flag to the caller's default             |
| `UnavailableInit`     | `@unavailable`          | errors instead of hanging against a dead backend             |
| `LargeIntegers`       | `@large-integers`       | resolves integers up to 2^53 − 1 exactly                     |
| `Targeting`           | `@targeting`            | resolves differently for a matching evaluation context       |
| `StandardReasons`     | `@standard-reasons`     | uses the standard reasons with the standard meanings         |
| `StringTyping`        | `@string-typing`        | a boolean or integer flag as a string is a mismatch          |
| `FullyTypedValues`    | `@fully-typed-values`   | the backend types floats and structures natively too         |
| `NumericCoercion`     | `@numeric-coercion`     | **not declarable here** — [see below](#javascript-notes)     |
| `Caching`             | `@caching`              | reserved; **not declarable** — no scenarios yet              |

Untagged scenarios are mandatory and always run; `capabilities` defaults to every _declarable_ one.
**A scenario whose capability was not declared is skipped, with the reason in the test name — never
passed:**

```
○ skipped Losing the backend makes the provider stale... — SKIPPED: provider does not declare @stale
```

What to declare is [Appendix F's rules for declaring][appendix-f], and the decision is per scenario
rather than per tag. **Four reasons a capability can be absent**, all four live here, and a report's
reader has to tell them apart:

| absence                                       | example here                                    | who decides           | lifetime                 |
| --------------------------------------------- | ----------------------------------------------- | --------------------- | ------------------------ |
| the provider **declines**, as the spec allows | `@reinitialization` — 2.5.2 permits reuse       | the adopter           | the provider's own       |
| the backend lacks a **fixture**               | `@large-integers` on a testbed without its flag | the adopter           | temporary; revisit       |
| the capability is **reserved**                | `@caching` — no scenario carries the tag        | this library, refused | until scenarios land     |
| this SDK cannot **express** it                | `@numeric-coercion` — one numeric type          | this library, refused | until the Evaluation API |

Only the first two are yours to state, and only the first says anything about the provider's design.

**`@string-typing` and `@fully-typed-values` are a pair, and the point of the pair is that you can
declare one and withhold the other.** A backend that records a boolean and an integer natively but
keeps floats and structures as text — Flagsmith's `feature_state_value` is exactly that — declares
`@string-typing` and withholds `@fully-typed-values`. The two rows it can answer then run, and a
provider that stringifies them anyway fails in the results where it belongs; the two rows its store
genuinely cannot answer skip as a permitted absence. A fully typed backend declares both. One tag
over all four cases hid a real provider defect inside the permitted absence, which is why Appendix F
split them, and the general rule it drew from that is worth carrying: **a capability coarser than
the variation providers actually show will hide defects inside permitted absences.**

### `knownDeviations`

**A `knownDeviations` entry says: this provider fails to do something it is required to do.** Where
the specification _permits_ the choice, withholding the capability is the honest report instead.

```ts
runProviderTck({
  // ...
  capabilities: [Capability.Stale, Capability.Variants /* ... */],
  knownDeviations: [
    KnownDeviation.untracked(Capability.Stale, 'never leaves STALE when the backend returns'),
    KnownDeviation.tracked(
      Capability.Variants,
      'https://github.com/acme/provider/issues/42',
      'the backend names a variant for every flag and the provider drops it',
    ),
  ],
});
```

Both keep their capability **declared**, the shape Appendix F prefers: the scenarios run and the
failures stay in the results. `summary` is required and the issue is not — two factories rather than
one optional argument, because an omitted URL and an untracked defect are the same value and very
different claims. Pass `undefined` as the capability for a mandatory, ungated scenario. The shape is
Java's `KnownDeviation` field for field.

## Running it

The harness's own suites are Docker-free and run in the default build with `npx nx test tck`. An
adoption gets a **target of its own** that no CI job invokes — `npx nx tck providers-flagd`,
`npx nx tck providers-ofrep` — run deliberately before merging a change to the suite or to a
provider it covers; why it is not a required gate is
[Appendix F, "Running the suite in CI"][appendix-f]. The exclusion is a Jest project of its own
under **`src/tck/`**, a sibling of the provider's `src/e2e/` rather than a child of it, reached only
by that target: each provider's unit project ignores `/src/tck/`, and flagd's pre-existing `e2e`
project no longer needs an ignore pattern at all, because the directory is no longer inside it.

A conformance suite is not a kind of e2e test, and the directory should not say it is. The two
answer different questions — the e2e suite tests the provider against its vendor's own harness, this
one tests it against the OpenFeature provider contract — and they mean different things by failure:
an e2e suite is expected green, while a conformance suite fails scenarios by design wherever a
`knownDeviation` is declared. The practical effect is that selection stops being a convention: a
file is in `src/tck/` or it is not, where before it depended on one Jest config remembering to
ignore a subdirectory of another.

Both `tck` targets set `passWithNoTests: false`, overriding the workspace default, so a run that
collects nothing fails rather than going green — the failure mode a relocated suite has, and the
reason the setting is worth more after a move than before.

## Conformance reports

Set `TCK_REPORT_DIR` and each suite writes two files: an envelope at `<dir>/<name>.json`, conforming
to the [report schema][report-schema] in the specification, and the results it points at, at
`<dir>/<name>.ndjson`. Unset means no report, which is not an error; several suites in one run write
their own pair each, so flagd's two resolvers do not collide. It is an environment variable rather
than a `TckOptions` field so that emitting a report is a property of the _run_ rather than of the
code: whoever wants one sets it, and no adopter changes a line to publish one.

```console
$ TCK_REPORT_DIR=./reports npx jest
$ jq -r 'select(.testStepFinished).testStepFinished.testStepResult.status' reports/in-memory.ndjson \
    | sort | uniq -c
     43 PASSED
     13 SKIPPED
```

**The results are [Cucumber Messages][messages], not a format this project defines** — per-scenario
outcomes, tags, Scenario Outline row identity and the executed feature source are all specified
there already. The envelope carries only what Messages has no opinion about: what was tested, and
what the provider claims. The stream is written first and the envelope second, carrying a `sha256`
digest of it, so an envelope never names results that have moved on.

**Every scenario appears exactly once**, whatever its outcome, including every scenario the
capability gate skipped — which is what makes Appendix F's rule checkable by a consumer rather than
dependent on the runner's summary. The harness checks that accounting at the end of every run,
report or no report. It also fails a run in which a canonical scenario never reached a decision: a
filtered run — `jest -t`, a stray ignore pattern, a mistake in the extension wiring — otherwise
satisfies the accounting and goes green while its report supports nothing. Working on one scenario
with `-t` therefore ends in a failed suite, which is the intended cost.

### Reading it

| Question                | Where the answer is                                                            |
| ----------------------- | ------------------------------------------------------------------------------ |
| what was in the suite   | one `Pickle` per scenario, one `TestCase` per pickle                           |
| the outcome             | `TestStepFinished.testStepResult.status`                                       |
| why it was skipped      | `TestStepFinished.testStepResult.message`                                      |
| the tags it carried     | `Pickle.tags`, `Examples`-block tags included                                  |
| which row of an outline | `Pickle.astNodeIds` — the second id is the `TableRow` in the `GherkinDocument` |
| what actually ran       | `Source`, verbatim                                                             |

`SKIPPED` is the only status either kind of skip gets — a second one is a status something
eventually reads as a pass — so **the message says which kind it was**, and a consumer reads that
rather than the status:

```
requires @stale, which this provider does not declare
requires @numeric-coercion, which no provider in this SDK can be asked about: JavaScript has a
single numeric type, so "a float requested as an integer" is not expressible
```

Only the first says anything about the provider, which is also why the envelope has no
`notApplicable` member: a capability that cannot hold in the _language_ is recorded once in
[Appendix F][appendix-f] rather than in every report.

A canonical scenario is identified in the stream by its path relative to the spec's asset directory
— `gherkin/errors.feature`, not a path relative to any repository root — and an extension scenario
under the reserved `extensions/` prefix. That partition is what a report consumer reads to tell the
two apart, and it is why extension scenarios do not count towards conformance.

In the envelope: `provider.name` is what the provider reports through its own metadata, while the
suite `name` is the _configuration_ tested, so one provider with two materially different modes
produces two reports that are not interchangeable. `declaration` is an input to reading the results
rather than a summary of them — given it and a scenario's tags, the reason for a skip follows — and
reserved capabilities are filtered out of `declared`, so no route into a declared set can write one
down. `knownDeviations` carries what the adoption declared, field for field, and is **absent when
nothing was declared, never emitted as `[]`**: stating none asserts that deviations were considered
and none found, which no suite can know on the adopter's behalf. `tck.specRevision` comes from
[`src/lib/revision.ts`](./src/lib/revision.ts), generated from the submodule at build time because
the submodule is not part of the published package.

There is no per-capability verdict, deliberately. A roll-up is derivable from the declaration and
the stream, and a consumer computing one should count only test cases that _ran_: every scenario
carrying a capability can be skipped for a _different_ one, so counting tag presence reports a green
result for a question nobody asked.

## Extending the suite

A vendor usually has behaviour outside the shared contract — flagd's `fractional` targeting is the
motivating example. Rather than a parallel harness that reimplements the lifecycle and then drifts,
pass `extensionFeatures` (a directory, a file, or a list of either) and, for words the canonical
vocabulary lacks, `extensionSteps`: they run in the same `describe`, under the same lifecycle,
backend reset and capability gate. A directory is scanned **recursively** and ordered by entry name
at each level, so the run is identical everywhere; paths resolve against the runner's working
directory, so pass absolute ones.

Three rules are enforced rather than documented, because the Java prototype let a same-named
extension file _replace_ a canonical one and the suite went green having run the adopter's version:
an extension feature may not take a canonical name (`errors`, `evaluation`, `events`, `lifecycle`,
`metadata`) and belongs in a directory of its own; it may not live inside the canonical asset
directory; and two may not share a **bare** name, since that is what attributes a scenario.
Canonical features load first and unconditionally, and jest-cucumber refuses a matcher that also
matches a canonical step.

A vendor step reaches the provider under test through the exported accessors, since it is registered
under a suite-scoped domain the adopter never sees. **Building a client of your own instead resolves
against a different provider** — one this suite never registered, so the step gets its default value
back and the scenario can pass against a `NoOpProvider`:

```ts
import { clientUnderTest, providerUnderTest } from '@openfeature/tck';

const vendorSteps: StepDefinitions = ({ then }) => {
  then(/^the split resolves "([^"]*)"$/, async (expected: string) => {
    expect(await clientUnderTest().getStringValue('fractional-flag', 'none')).toBe(expected);
  });
};
```

`providerUnderTest()` returns the provider itself, for a step whose subject is the provider's own
surface. Both throw before the scenario has registered one, which means before a
`Given a stable provider` step: put one in a `Background`.

## JavaScript notes

**`@numeric-coercion` cannot be asked of any provider in this language, and the library refuses it.**
`typeof 10` and `typeof 0.5` are both `'number'` and the Evaluation API exposes only
`getNumberDetails`, so requesting `float-flag` as an integer is indistinguishable from requesting it
as a float: there is no lossless coercion to permit and no lossy one to reject. Its scenarios are
skipped in every run naming that reason, and naming the capability is an error rather than a quiet
correction, so you cannot get this wrong. Accessor width is separate: JavaScript represents
2^53 − 1 exactly, so declare `@large-integers` unless your transport rounds it on the way. Neither
gets a field of its own in a report — four implementations built one and no adoption populated it.

**Timeouts.** `runProviderTck` raises Jest's per-test timeout for you, derived from your two
settings; `jest.setTimeout` after the call overrides it. Jest's 5 s default is below everything this
suite works to, so it was always the cap that fired first, and the harness's own timeouts — which
fail with a message naming what did not happen — were unreachable.

## Contributing: where the artifacts come from

The feature files, canonical flag set and control-API document are **not owned by this repository**:
they are the language-agnostic artifacts under `specification/assets/provider-tck/` in
[open-feature/spec][spec], consumed through a git submodule at `spec/` and **never copied**, so
changes belong upstream. Adopters need none of it — `nx package` copies them into the published
library — while contributors run `git submodule update --init libs/shared/tck/spec`, which the
`pullSpec` target behind `nx test tck` and `nx package tck` does for you. That target also
regenerates [`src/lib/revision.ts`](./src/lib/revision.ts), so the revision a report names is
refreshed by the same command that checks the artifacts out; the file is committed, because a plain
`jest` invocation does not go through Nx.

That dependency is a build-graph edge rather than an immutable fetch: it makes a stale checkout
impossible to run _past_, not impossible to have. The failure it exists to stop happened here once
before the edge existed — a rebase moved the gitlink, the working tree stayed on the previous pin,
and the suite ran anyway, reporting byte-identical numbers against the wrong assets.

## Known gaps

[Appendix F][appendix-f] carries the suite's gaps — context passthrough beyond the targeting key,
per-flag control operations, caching, hooks, flag metadata, `@stale`'s lack of Docker-free coverage
in any language, and the requirements not yet covered. Two are worth naming here because the
appendix does not:

- **`POST /restart` is unused**, so `ConnectionControl` has no `disconnectFor`: no current scenario
  needs a bounded outage. What would bring it back is a `@caching` scenario asserting what a stale
  provider serves _during_ an outage, which needs `/restart`'s preservation of flag state.
- **Neither adoption suite compiles in the default build**, which Appendix F asks for — two of two,
  by one mechanism each. `nx package` typechecks against the provider's `tsconfig.lib.json`; OFREP's
  adoption is a single `*.spec.ts` and falls out under `src/**/*.spec.ts`, while flagd's is named by
  `./src/tck` in that file's `exclude`. `nx test` ignores `/src/tck/` in both and ESLint here is not
  type-aware, so `npx nx tck providers-<name>` is the only thing that compiles its own suite.

  flagd's exclusion is explicit because moving the adoption out of `src/e2e/` made it necessary, and
  that is worth recording because it is the shape of the gap rather than an accident of it. The
  wholesale `./src/e2e` exclusion stopped covering the suite, `suite.ts` fell _into_ the library
  build, and the build failed with thirteen errors — none in the adoption's own code. A library
  build compiles what gets published, so it sets `types: []` and `module: ES6`; the conformance
  harness is a test library whose exported entry point calls `describe`, `test` and `jest`. An
  adoption cannot join a library build, so "compiles in the default build" cannot mean `nx package`
  here, however the directories are arranged.

  Note which way that failed. A path-based boundary changes what a build _contains_, as a side
  effect of where files sit; here it added the suite to a build that cannot compile it, and said so.
  The same hazard in the other direction is silent — a suite dropped out of every build typechecks
  nowhere and nothing fails — which is what makes the loud version the lucky one.

  What "compiles in the default build" can mean here is a
  `tsc --noEmit -p <provider>/tsconfig.spec.json` step, and the move makes a narrower one possible:
  the conformance suite is now a directory nothing else is in, so a config over `src/tck` alone
  expresses "typecheck the adoption" — where before, the smallest thing that covered it was
  `./src/e2e`, which took answerability for the pre-existing e2e files with it. That was the cost
  this bullet used to name, and it is no longer forced. Both adoptions pass
  `tsc --noEmit -p tsconfig.spec.json` today; nothing in the default build runs it.

[appendix-f]: https://github.com/open-feature/spec/blob/main/specification/appendix-f-provider-conformance.md
[messages]: https://github.com/cucumber/messages
[report-schema]: https://github.com/open-feature/spec/blob/main/specification/assets/provider-tck/report/conformance-report.schema.json
[spec]: https://github.com/open-feature/spec
[tracking]: https://github.com/open-feature/spec/issues/417

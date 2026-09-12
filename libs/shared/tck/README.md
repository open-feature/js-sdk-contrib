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
import { Capability, runProviderTck } from '@openfeature/tck';

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

Contributors to this repository _do_ need the submodule, because in-tree the artifacts are read
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

`runProviderTck` raises **Jest's** per-test timeout for you, and you should not need to touch it.
Jest's default is 5 s, which is below everything this suite works to — `eventTimeoutMs` defaults to
12 s, `readyTimeoutMs` to 30 s, and `lifecycle.feature` bounds an error event at 10 s — so whichever
cap fired first was Jest's, and the harness's own timeouts, which exist to fail with a message
naming what did not happen, were unreachable. The value is derived from your two settings rather
than picked, and it is a backstop: if it is what fires, something is wrong that the message will not
explain.

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
  given(/^a fractional rule splitting "([^"]*)" (\d+)\/(\d+)$/, async (key, a, b) => {
    /* ... */
  });
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

`extensionFeatures` takes a directory or a single file, or a list of either. A directory is scanned
**recursively**, so grouping features into subdirectories works and does not quietly drop them;
ordering is by entry name at each level, depth first, so it is the same on every platform. Paths
resolve against the runner's working directory rather than your test file's, so pass absolute ones.

Two rules are enforced rather than documented, because without them the Java prototype let a
same-named extension file _replace_ a canonical one — the suite went green having run the adopter's
version of a canonical scenario:

- an extension feature may not be named after a canonical one (`errors`, `evaluation`, `events`,
  `lifecycle`, `metadata`), and belongs in a directory of its own;
- an extension feature may not live inside the canonical asset directory.

Both survive the recursion, and so does the rule that two extension features may not share a name:
a scenario is attributed by the **bare** file name, so a subdirectory does not qualify it and
`targeting/fractional.feature` beside `caching/fractional.feature` is refused.

A step matcher that also matches a canonical step is rejected by jest-cucumber as ambiguous, so an
extension cannot redefine what a canonical step means either.

The canonical features are loaded unconditionally and first, so no extension wiring can keep one out
of the run. An extension scenario carries no weight in a conformance claim: it is the adopter's own
question, run in the adopter's own suite.

In the results stream, an extension scenario is named under the `extensions/` URI prefix while a
canonical one is named by its path **relative to the spec's asset directory** —
`gherkin/errors.feature`, not a path relative to any repository root. That partition is what a report
consumer reads to tell the two apart, and it is why extension scenarios do not count towards
conformance. Both forms are [Appendix F][appendix-f]'s, stated there exactly because a phrasing that
merely implied them produced three different answers across four TCK implementations.

### Reaching the provider under test from a vendor step

`StepDefinitions` is handed nothing but jest-cucumber's own `given`/`when`/`then`, and the provider
is registered under a suite-scoped domain the adopter never sees. So a vendor step that wants to
evaluate a flag has two options, and only one of them is a test of anything:

```ts
import { clientUnderTest, providerUnderTest } from '@openfeature/tck';

const vendorSteps: StepDefinitions = ({ then }) => {
  then(/^the split resolves "([^"]*)"$/, async (expected: string) => {
    expect(await clientUnderTest().getStringValue('fractional-flag', 'none')).toBe(expected);
  });
};
```

`clientUnderTest()` is the client of the provider this scenario registered — the same client every
canonical step uses. **Building a client of your own instead resolves against a different
provider**: a fresh `OpenFeature.getClient()` sits in the default domain, where the provider under
test was never registered, so the step asks its question of whatever happens to be there. A vendor
scenario that passes against a `NoOpProvider` is the failure mode this accessor exists to remove,
and it is a quiet one — the step returns the default value and the assertion is what fails, so it
reads as a provider defect rather than as test wiring.

`providerUnderTest()` returns the provider instance itself, for a step whose subject is the
provider's own surface rather than the SDK's handling of it — the same distinction the canonical
lifecycle and metadata steps draw. A fresh instance per scenario, so hold it no longer than the step
that asked for it.

Both throw before the scenario has registered a provider, which in the canonical vocabulary means
before a `Given a stable provider` step. Put one in a `Background`, as the canonical features do.

Every language's suite has this route, because without it the extension point is not usable: Go's
`tck.ClientFromContext(ctx)`, Java's `TckState` injected into the step class, Python's `tck_state`
fixture. JavaScript's is module-scoped rather than injected because that is where jest-cucumber puts
a step definition — `StepDefinitions` is a module-level closure, so a module-level accessor is the
one thing it can always reach. Jest gives every test file its own module registry, and the suite
already requires one `runProviderTck` call per file, so "the suite in this module" and "the suite in
this file" are the same thing. A second call in one file is refused with a message saying so.

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
example row is then defined under its _expanded_ title instead, so a skipped example row showed no
reason at all — four rows of `errors.feature` whenever `@object` is undeclared. jest-cucumber accepts
the `describe`/`test` pair it calls, so the harness supplies one and names the skip at the point the
call is made. See [`src/lib/scenarioRunner.ts`](./src/lib/scenarioRunner.ts).

| Capability                       | Tag                     | Meaning                                                                                                                  |
| -------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `Capability.Events`              | `@events`               | emits lifecycle events at all                                                                                            |
| `Capability.Lifecycle`           | `@lifecycle`            | performs an initialisation that reaches its backend, with an observable outcome — **see below**                          |
| `Capability.Reinitialization`    | `@reinitialization`     | can be initialised again after `shutdown`, which the specification permits rather than requires — **see below**          |
| `Capability.Stale`               | `@stale`                | enters `STALE` and emits `PROVIDER_STALE` on backend loss                                                                |
| `Capability.ConfigurationChange` | `@configuration-change` | detects configuration changes and emits `PROVIDER_CONFIGURATION_CHANGED`                                                 |
| `Capability.Object`              | `@object`               | supports structured flag values                                                                                          |
| `Capability.Variants`            | `@variants`             | names the variant it resolved, which requirement 2.2.4 makes a `SHOULD` and `types.md` types as optional — **see below** |
| `Capability.DisabledFlags`       | `@disabled-flags`       | resolves a flag disabled in the management system to the caller's default — **see below**                                |
| `Capability.UnavailableInit`     | `@unavailable`          | reports an error state instead of hanging against a dead backend                                                         |
| `Capability.NumericCoercion`     | `@numeric-coercion`     | coerces between integer and float only when lossless, else `TYPE_MISMATCH` — **see below**                               |
| `Capability.LargeIntegers`       | `@large-integers`       | resolves integers up to 2^53 − 1 exactly; leave undeclared where the transport rounds it                                 |
| `Capability.Targeting`           | `@targeting`            | resolves a flag differently for a matching evaluation context                                                            |
| `Capability.Caching`             | `@caching`              | reserved; **not declarable** — no scenarios yet                                                                          |

Untagged scenarios are mandatory and always run. `capabilities` defaults to every _declarable_
capability — narrow it rather than widening it.

A **reserved** capability is a name held open for a scenario nobody has written yet. `@caching` is
the only one left: no scenario carries it, so declaring it cannot cause a skip — it says nothing
about the provider, plays no part in reading the results, and only invites a reader to believe
something was verified when nothing examined it. It is excluded from the default, and naming it in
`capabilities` is **rejected** rather than passed through to the report:

```
capabilities names @caching, which no scenario carries. @caching is a reserved name held open for
scenarios that do not exist yet: declaring one cannot cause a skip, so it says nothing about this
provider and would invite a report's reader to believe it was verified.
```

This is not a hypothetical tidy-up. A published Java conformance report asserts both `@targeting`
and `@caching` as declared — not by anyone's decision, but because that adoption declares "every
capability except X" and picks up every reserved tag in the vocabulary on the way past. Rejecting is
louder than warning on purpose: a console line competes with Jest's own output and is invisible in
the log of a green CI build, and the fix is a one-line edit. The emitter also filters reserved tags
out of `declaration.declared`, so no route into a declared set can write one down.

Which capabilities are reserved is decided upstream, in Appendix F, and recorded here in
`RESERVED_CAPABILITIES`. The harness checks that list against the feature files it actually ran and
fails if a reservation has expired — a scenario arriving upstream is what makes a capability
declarable, and an out-of-date list would go on making a testable capability unclaimable. That is
how `@targeting` came to be declarable: it was reserved on exactly the same footing as `@caching`
until Appendix F gained three scenarios for it. A reservation expiring is the expected course of
events rather than a surprise.

A capability whose question cannot be put to your provider _at all_ is simply left undeclared, like
any other, and its scenarios are skipped. There is no second field and no second status: one skip
carrying its reason says everything a parallel representation would, and where the impossibility is
a property of the _language_ rather than of the provider it is recorded once — against the
capability and in Appendix F — instead of restated in every report. In JavaScript that case is
`@numeric-coercion`, and it is the subject of a section of its own below.

### A defect is not a decision: `knownDeviations`

**A `knownDeviations` entry says: this provider fails to do something it is required to do.** The
requirement has to be a numbered `MUST`, or a rule the implementation bound itself to elsewhere.
Where the specification _permits_ the choice, withholding the capability **is** the honest report,
and a deviation entry would assert a defect that does not exist.

Leaving a capability out of `capabilities` reads as a decision, and it cannot say "this provider
attempts the behaviour and gets it wrong". Both a defect and a decision produce the same skip, so a
consumer comparing providers reads one as the other unless something says which happened. That is
what this field is for.

It is legitimate in two shapes, and a report's results already distinguish them:

1. **The capability is declared, the scenario runs, and it fails.** Prefer this. The failure stays
   visible and the deviation says it is known and why.
2. **The capability is withheld, and its scenarios skip.** Legitimate only when the provider cannot
   attempt the behaviour at all, so running the scenario would establish nothing. The deviation then
   explains the absence, so a reader can tell a defect from a design decision.

Withdrawing a capability _in order to_ turn a failing scenario into a skip is the failure mode this
field exists to prevent. If the provider attempts the behaviour and gets it wrong, shape 1 is the
honest report:

```ts
import { Capability, KnownDeviation, runProviderTck } from '@openfeature/tck';

runProviderTck({
  // ...
  capabilities: [Capability.Stale, Capability.LargeIntegers /* ... */],
  knownDeviations: [
    KnownDeviation.untracked(
      Capability.Stale,
      'the provider emits PROVIDER_STALE on backend loss but never leaves STALE when the backend ' +
        'returns, so it serves cached values indefinitely',
    ),
    KnownDeviation.tracked(
      Capability.LargeIntegers,
      'https://github.com/open-feature/flagd-testbed/pull/392',
      'the testbed has no large-integer-flag, so the 2^53 - 1 scenario cannot pass yet',
    ),
  ],
});
```

`summary` is required: an entry with no summary records that something is wrong without saying what,
which is worth less than the bare skip or failure it accompanies. The issue is optional — use
`tracked` once there is an issue to point at and `untracked` before then, two factories rather than
one optional argument, because an omitted URL and an untracked defect are the same value and very
different claims. Naming an untracked defect is still what separates it from a choice. Pass
`undefined` as the capability when the gap is against a mandatory, ungated scenario and so belongs
to no capability.

Declaring a deviation changes nothing about what runs; it is a statement about the provider, printed
with the suite's declaration and carried through to whatever reads it. The shape is Java's
`KnownDeviation`, field for field, so the same defect reported in two languages compares without a
translation table. A reserved capability is refused here for the same reason as everywhere else: no
scenario carries it, so there is nothing to deviate from.

**Check the requirement before you record one.** Where a scenario is gated on a capability, the gate
itself is often the specification saying the behaviour is optional — `@reinitialization` is exactly
that, and a provider that declines reuse owes no deviation at all, because nothing is broken. Find
the numbered requirement first; a failing scenario is not on its own evidence of a defect. That is
the difference between shape 2 and a withdrawal with nothing to report: shape 2 still names a
requirement the provider fails.

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

### `@reinitialization` is not `@lifecycle` either

Declaring `@lifecycle` says your provider initialises for real. It does _not_ say the provider can be
initialised a second time after `shutdown`, and those come apart because the specification permits
reuse rather than requiring it.
[Requirement 2.5.2](https://github.com/open-feature/spec/blob/main/specification/sections/02-providers.md)
says a provider **SHOULD** revert to its uninitialized state after `shutdown`, and its supporting
text adds that _"some providers **may** allow reinitialization from this state"_. A provider that
releases its client on shutdown and declines to start again is taking an option the specification
offers it.

This is worth spelling out because getting it wrong has a cost, and it was paid once already. The
reuse scenario was originally untagged, on the reading that reverting to the uninitialized state is
observable as exactly one thing — the provider can be initialised again and then serves flags. The
inference does not hold, and while it stood, a provider making a permitted choice was reported as
failing conformance and the failure was on its way to being filed as a defect against the
implementation. **A false failure is the mirror image of a vacuous pass**, and this library cares
about both.

So do not reach for `knownDeviations` when the reuse scenario fails. Leave `@reinitialization`
undeclared and the scenario is skipped, which is the accurate report: nothing is broken. Declare it
only once you have tested that a second `initialize()` genuinely works — where it does, the scenario
is worth having, because releasing the client on shutdown while leaving an initialised flag set is
easy to write and leaves the provider evaluating against a closed connection rather than failing
outright.

The general rule, of which this is one instance: before recording a deviation or withholding a
capability because a scenario failed, find the numbered requirement and check that the specification
asks for the behaviour at all.

### `@variants` is a `SHOULD`, and used not to be gated at all

Every evaluation scenario asserted a variant, which reads as obviously correct right up until a
backend with no variant concept for a plain flag is put under test. Its evaluation response carries
no such key, the provider never receives one, and no amount of seeding can produce one — so ten
scenarios failed a conformant provider for something its author could not fix, and there was nothing
to record as a `knownDeviation` either, because no capability existed to hang one on.

Both places that type the field say it is optional.
[Requirement 2.2.4](https://github.com/open-feature/spec/blob/main/specification/sections/02-providers.md)
is a **SHOULD** and adds that the value _"might only be meaningful in the context of the flag
management system associated with the provider"_; `types.md` types it `variant (string, optional)`.
The suite was asserting a `MUST` neither of them states.

The variant assertions are therefore consolidated into a single gated Scenario Outline of eight
rows. Declare `@variants` where your backend names its variants and they run; leave it undeclared
and they are skipped with that reason rather than passed. Nothing else changes either way — the
value and reason assertions for the same flags are untagged, requirement 2.2.3 making the value a
`MUST`.

The `reason` assertions are the deliberate exception, and Appendix F states it as a decision rather
than leaving it as an oversight: requirement 2.2.5 is also a `SHOULD` and even permits _"some other
string"_, yet the suite pins a specific reason anyway, because a wrong reason is its cheapest
diagnosis of a provider quietly falling back to the code default. Read a reason failure differently
from a value failure: the value rests on a `MUST`, the reason on a house rule.

### `@targeting` stopped being a reservation

`@targeting` was a reserved name — targeting being backend evaluation logic, and so out of scope —
until Appendix F gained `targeting-key-flag` and three scenarios for it. It is now declarable like
any other capability.

What changed is that a targeting key is the one piece of evaluation context whose passthrough is
observable without an echo endpoint on the control API. Every other canonical flag resolves the same
way whatever the context, so a provider that drops the context on the floor passes all of them;
`targeting-key-flag` resolves `hit` for one specific targeting key and `miss` otherwise, so dropping
it is caught by the resolved value itself. All three scenarios are needed: the matching context, the
non-matching one — without which a provider that always returned the targeted value would pass — and
no context at all, which catches a provider that requires a targeting key or cannot evaluate a rule
without one.

This is still not the backend's rule language under test. The flag's rule is specified by behaviour
— resolve `hit` when the targeting key is exactly `5c3d8535-f81a-4478-a6d3-afaa4d51199e` — so a
backend expresses it however it expresses targeting, and the flag, its variants and the uuid are
[flagd-testbed][flagd-testbed]'s own, so a backend already serving that harness already serves this.

**The TCK's own in-memory suites leave it undeclared**, and that is a fact about the fixture rather
than a defect. `InMemoryProvider` takes its rules from a `contextEvaluator` _function_, and the
canonical flag-definition format expresses a rule as _data_; there is no way to carry a function
through JSON, so the flag's `targeting` member is inert for that decoder and the flag resolves `miss`
whatever the context. Leaving the capability undeclared is the honest report. Synthesising an
evaluator to turn the scenarios green would be worse than the skip: it would test a fixture written
for the occasion instead of a provider.

### `@disabled-flags` is a fact about the provider and its backend together

A flag disabled in the flag management system resolves to nothing, and the caller's default stands
in. What the four `@disabled-flags` rows ask is whether your provider gets there — and the answer is
decided by **where the substitution happens** rather than by how good the provider is. Only the
caller ever has the default value, so the question is whether it is in hand at the point the flag's
state is read, and where it is not, whether the wire format can say _"no value"_ plainly enough for
the client to put it in.

A provider that evaluates locally has it in hand: an in-memory provider has nowhere else to decide,
and flagd's in-process resolver syncs the ruleset and evaluates it locally. A provider whose backend
decides depends on the protocol between them, and both of the ones in this repository carry it.
flagd's RPC resolver receives the _type's_ zero value with `reason: DISABLED` and an empty variant,
and substitutes the caller's default itself. OFREP goes further: its response schema makes `value`
optional and flagd's handler omits the field altogether, which `ofrep-core` reads as "use the
default".

**The capability was drafted expecting OFREP not to be able to have it**, on the reasoning that the
request never carries a default so the server cannot return one. Measuring it said otherwise — the
server does not have to return a value at all. What genuinely cannot have it is a pair where the
backend answers a disabled flag with the flag's _configured_ value, or with an error, and the client
has no hook to substitute on. That is a property of the provider and its backend together, which is
why the tag is gated and why declaring it is a claim about the pair the run was made against.

So this is a capability, and one of the clearest cases for [`knownDeviations` being the wrong
tool](#a-defect-is-not-a-decision-knowndeviations): a provider whose pairing cannot have the
capability leaves it undeclared and owes **no** deviation, because there is no defect to record.
Reach for a deviation only where a provider that _does_ have the default in hand gets it wrong.

Nothing in the specification says what a provider owes a disabled flag — requirement 1.4.7 is about
the SDK propagating whatever reason arrived, and requirement 2.2.5 only lists `DISABLED` among the
reason strings a provider _may_ use. Appendix F therefore states the behaviour, as it does for
`@numeric-coercion`, and gates it.

The rows assert the **value** and the absence of an error, and deliberately not the reason. Each
row's caller default differs from the flag's configured value, so a provider that ignores the state
returns the configured value and is caught on the value alone, which rests on requirement 2.2.3 — a
`MUST`. Pinning reason `DISABLED` would rest on 2.2.5, the `SHOULD` that expressly permits _"some
other string"_. No variant is asserted either: a disabled flag resolved no variant, so there is none
to name, and `@disabled-flags` and `@variants` do not compose. That is also why the four rows are
scalar-only — a row needing both `@object` and this tag could not be one row of a single outline.

## The one place JavaScript cannot answer the shared question

`@numeric-coercion` has two halves: a provider must resolve a coercion that loses nothing — `10.0`
asked for as an integer — and must report `TYPE_MISMATCH` for one that does not, rather than
silently narrowing `0.5` to `0`. The rule is flagd's [numeric coercion ADR][coercion-adr], and the
tag was called `@strict-numeric-typing` until it was renamed to match. In Go, Java and Python this is
a real question with a right answer.

**JavaScript has no integer type.** `typeof 10` and `typeof 0.5` are both `'number'`, the Evaluation
API exposes only `getNumberDetails`, and the in-memory provider type-checks with
`typeof value != typeof defaultValue`. Requesting `float-flag` as an Integer is therefore
_indistinguishable_ from requesting it as a Float, so **neither half can be put to a provider in
this language**: there is no lossless coercion to permit, because `10.0` and `10` are the same value
and nothing is narrowed, and no lossy one to reject, because `0.5` asked for as an Integer is
indistinguishable from a valid Float request. Not a defect — the distinction does not exist here.

Both halves of the rule now have scenarios: `float-flag` (`0.5`) as an integer must be rejected, and
`integral-float-flag` (`10.0`) as an integer and `integer-flag` (`10`) as a float must succeed. All
three are gated on the one tag, so all three are skipped here, for the same reason. Accessor width
is modelled separately, as `@large-integers`: JavaScript represents 2^53 − 1 exactly, so a provider
declares it unless its transport rounds the value on the way.

So every JavaScript suite simply leaves the capability out of `capabilities`, and its scenarios are
skipped:

```ts
runProviderTck({
  // ...
  capabilities: [Capability.Events, Capability.ConfigurationChange, Capability.Object],
  // @numeric-coercion is left undeclared. See below for why that is not a gap.
});
```

```
○ skipped A float flag is not silently narrowed to an integer — SKIPPED: provider does not declare @numeric-coercion
```

**Where that sentence about the language lives.** Not in the report, and not in the skip. The
impossibility is a property of the _SDK_ — true of every provider written against it, and for as
long as the Evaluation API has a single numeric accessor — so it is stated once in the TSDoc on
`Capability.NumericCoercion`, once in this section, and once upstream in
[Appendix F][appendix-f]. A per-report field would repeat a language fact on each provider's behalf
and would still say nothing in a run where no scenario carried the tag; four implementations built
such a field and no adoption in any of them populated it, which is why the report schema dropped it.

The consequence is worth stating plainly: read only the skip line, or only a report's declaration,
and you learn that `@numeric-coercion` was not declared but not why it could not be. That is
deliberate — the reason is one lookup away, in the two places above, rather than duplicated per
scenario — but it does mean the _why_ is documentation rather than run output. A JavaScript provider
that withheld the tag for some other reason, such as a real narrowing defect, must therefore say so
through `knownDeviations`, which is exactly what that field is for.

The capability's meaning being language-dependent is worth flagging upstream regardless, since the
specification does not currently acknowledge it. Raised on [spec#417][tracking].

## A provider with a backend: supply a Compose file and nothing else

Most providers talk to something, and orchestrating that something used to be the adopter's job. It
was also the single largest adoption cost in the suite: every flagd adoption in every language
hand-rolled a container wrapper, and each one re-solved dynamic port discovery, control-API
readiness and teardown for itself.

**The suite owns the stack.** Name a Compose file, say which ports the provider connects to, and
build a provider from the endpoint it discovers:

```ts
import { join } from 'node:path';
import { runContainerizedProviderTck } from '@openfeature/tck';

runContainerizedProviderTck({
  name: 'my-provider',
  composeFile: join(__dirname, 'docker-compose.yaml'),
  backendPorts: [8013],
  newProvider: (endpoint) => new MyProvider({ host: endpoint.host, port: endpoint.port(8013) }),
  newUnavailableProvider: () => new MyProvider({ host: 'localhost', port: 9999 }),
});
```

That is the whole adoption. The suite starts the stack once, discovers the dynamically mapped host
ports, builds the `HttpControl` against the control API, waits until it accepts commands, constructs
a provider per scenario, and tears the stack down after the last one. Every other option —
`capabilities`, `knownDeviations`, `extensionFeatures`, the timeouts — is the same as for
`runProviderTck`.

| option                 | required | default     | what it is                                                       |
| ---------------------- | -------- | ----------- | ---------------------------------------------------------------- |
| `composeFile`          | yes      | —           | path to the Compose file; pass an absolute one                   |
| `backendPorts`         | yes      | —           | container-internal ports the **provider** connects to            |
| `newProvider`          | yes      | —           | builds the provider from a `BackendEndpoint`                     |
| `backendService`       | no       | `'backend'` | the Compose service hosting both the control API and the backend |
| `controlPort`          | no       | `8080`      | container-internal port of the control API                       |
| `additionalPorts`      | no       | `{}`        | extra service → ports, for a stack with more than one service    |
| `backendConfiguration` | no       | `'default'` | the backend's configuration name passed to `POST /start`         |
| `startupTimeoutMs`     | no       | `60000`     | budget for the stack and its control API to become reachable     |

`backendConfiguration` names the **backend's** configuration, not the provider's. A report's
`provider.configuration` is which mode of the provider was tested — flagd RPC against flagd
in-process — and `name` is what feeds that. The two were worth keeping apart in every language's
spelling rather than in a comment: three of the four had taken the bare word for the backend's, so
`configuration` meant opposite things depending on which suite you were reading.

The concepts and the defaults are identical in Go, Java and Python, deliberately: an adopter porting
a stack between two languages' suites should be changing syntax, not re-deriving the contract.

Three rules are not preferences:

- **The Compose file must not pin host ports.** Docker assigns them dynamically and the suite
  discovers them after startup. A pinned port collides with a developer's own backend and makes the
  suite unrunnable in parallel.
- **The stack starts once and is never restarted.** Testcontainers cannot reliably preserve mapped
  host ports across a restart, so a restart would silently invalidate every provider already pointed
  at the old port. Unavailability is always simulated inside the running stack through the control
  API.
- **`newProvider` is a factory, called once per scenario**, because the mapped ports do not exist
  until the stack is up.

`backendPorts` and `additionalPorts` are configuration rather than documentation: Compose publishes
whatever the Compose file lists whether the options mention it or not, so the suite resolves only
ports that were declared and names the option to edit when one was not. The control port is mapped
automatically and listing it in `backendPorts` is refused — that option is the ports the _provider_
connects to, and a provider pointed at the control API would be testing the testbed.

`startupTimeoutMs` counts from `docker compose up`, so on a machine that has not pulled the images it
includes the pull. 60 seconds suits a warm machine; a cold CI runner wants considerably more. The
suite also sets a Jest test timeout of `readyTimeoutMs + 4 × eventTimeoutMs`, because Jest's own
five-second default is never enough for a real backend; call `jest.setTimeout` after
`runContainerizedProviderTck` to override it.

`testcontainers` is an **optional peer dependency** and is loaded on first use, not on import, so a
provider with no backend adopts this library without pulling Docker tooling into its `node_modules`.
Install it in the adopting project — `npm i -D testcontainers` — if you use this entry point.

`runProviderTck` remains the path for a provider with no backend, which supplies its own
`BackendControl`. Compose is an additional path, and now the default one, for a provider that talks
to something.

## Conformance reports

Set `TCK_REPORT_DIR` and each suite writes two files: an envelope at `<dir>/<name>.json`,
conforming to the [report schema][report-schema] in the specification, and the results it points at
at `<dir>/<name>.ndjson`.

**The results are [Cucumber Messages][messages], not a format this project defines.** Per-scenario
outcomes, tags, Scenario Outline row identity and the executed feature source are all specified
there already, and specifying them again would mean a second format to version and two places for
the same fact to disagree. The envelope carries only what Messages has no opinion about: what was
tested, and what the provider claims.

```console
$ TCK_REPORT_DIR=./reports npx jest
$ jq -r 'select(.testStepFinished).testStepFinished.testStepResult.status' reports/in-memory.ndjson \
    | sort | uniq -c
     43 PASSED
     13 SKIPPED
```

It is an environment variable rather than a `TckOptions` field so that emitting a report is a
property of the _run_ and not of the code: CI sets it, a developer running the suite locally does
not, and no adopter changes a line to publish one. Unset means no report, which is not an error.
Several suites in one run each write their own pair of files, so flagd's two resolvers do not
collide. The stream is written first and the envelope second, carrying a `sha256` digest of it, so
an envelope never names results that are not there or have moved on.

**Every scenario appears exactly once**, whatever its outcome: one `Pickle`, one `TestCase` and one
`TestCaseStarted`/`TestStepFinished`/`TestCaseFinished`, including for every scenario the capability
gate skipped. That is what makes Appendix F's rule — a scenario skipped for an undeclared capability
is reported as skipped and _never_ as passed — checkable by a consumer rather than dependent on the
runner's summary being trustworthy. The harness checks the accounting itself at the end of every
run, report or no report, and fails the suite if a scenario is missing or recorded twice.

**The canonical scenarios must also have actually run.** The accounting above proves the report has
an entry per scenario; it does not prove the run produced those entries, because a scenario is
registered when it is _defined_ and one the runner declines to run carries a placeholder failure
instead. So a filtered run — `jest -t`, a `testPathIgnorePatterns` entry, a mistake in the extension
wiring — satisfies the accounting and goes green while its report supports nothing. The harness
therefore fails the suite unless every canonical scenario reached a decision. A capability skip is a
decision and passes the check; extension scenarios are excluded from it, because which of their own
scenarios an adopter runs is the adopter's business.

Working on one scenario with `-t` therefore ends in a failed suite. That is the intended cost: the
alternative is a green run that cannot be told apart from a complete one.

### Reading the stream

| Question                   | Where the answer is                                                            |
| -------------------------- | ------------------------------------------------------------------------------ |
| what was in the suite      | one `Pickle` per scenario, one `TestCase` per pickle                           |
| what the outcome was       | `TestStepFinished.testStepResult.status`                                       |
| why it was skipped         | `TestStepFinished.testStepResult.message`                                      |
| what tags it carried       | `Pickle.tags`, `Examples`-block tags included                                  |
| which row of an outline    | `Pickle.astNodeIds` — the second id is the `TableRow` in the `GherkinDocument` |
| what was actually executed | `Source`, verbatim                                                             |

The eleven rows of `errors.feature`'s type-mismatch matrix are the case that matters. They share a
scenario name, and they share their _expanded_ name too, because that outline's title has no
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

A scenario is registered when it is _defined_, so one Jest never finished — a timeout, or a `-t`
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
  _configuration_, and it is reported as such. One provider with two materially different modes
  produces two reports that are not interchangeable.
- **`declaration` is an input to reading the results, not a summary of them.** A skipped test case
  says the question was not put to this provider; only the declaration says whether that is because
  the provider declines the capability — `declared` does not list it. Given the declaration and a
  scenario's tags, the reason for any skip follows without being transported per scenario. There is
  no parallel not-applicable member: a capability that cannot hold in the _language_ at all is a
  property of the SDK, recorded once in [Appendix F][appendix-f] rather than in every report, and in
  a run it is simply undeclared with the skip carrying the reason.
- **`tck.specRevision`** comes from [`src/lib/revision.ts`](./src/lib/revision.ts), which
  [`scripts/write-revision.js`](./scripts/write-revision.js) generates from the submodule. It is
  captured at build time because the submodule is not part of the published npm package. Nothing
  else about the artifacts needs asserting: the stream carries every executed feature file verbatim
  as a `Source`, which identifies them by content, covers only what ran, and is under the digest.
- **`backend.controlApi`** reports how the backend was driven, and both it and the `backend` block
  it sits in are always written, because the schema requires both. `BackendControl` requires the
  member, so there is nothing here to infer — see [Controlling the
  backend](#controlling-the-backend) for why a value that could be absent would be an unfalsifiable
  claim rather than no claim.
- **`knownDeviations`** carries whatever [`knownDeviations`](#a-defect-is-not-a-decision-knowndeviations)
  the adoption declared, field for field. **The field is absent when nothing was declared, and never
  emitted as `[]`** — an empty array asserts that deviations were considered and none found, which no
  suite can know on the adopter's behalf, so the two are different claims and only one of them is
  honest by default. Go, Python and Java omit it on the same rule.

There is no per-capability verdict in the report, and that is deliberate. A roll-up is derivable
from the declaration and the stream, and a consumer computing one should count only test cases that
_ran_: every scenario carrying a capability can be skipped for a _different_ one — both scenarios in
`events.feature` carry `@events` as well as `@stale` or `@configuration-change` — so counting tag
presence rather than execution reports a green result for a question nobody asked. Nor is a capability roll-up a conformance verdict in the first
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

`HttpControl` is the client for it, and it implements both `BackendControl` and `ConnectionControl`
over the global `fetch`, so it adds no dependency. **If your stack comes up from a Compose file you
never construct it**: `runContainerizedProviderTck` builds it for you and awaits its readiness — see
above. What follows is for a backend the suite cannot bring up itself: one already running in CI, or
one started by tooling of your own.

It takes a thunk for the base URL because a control service's host port is usually mapped
dynamically and does not exist until the stack is up, whereas `runProviderTck` has to be called at
module load:

```ts
const control = new HttpControl({ baseUrl: () => `http://${myStack.controlUrl()}` });
```

`awaitReady(timeoutMs)` polls `GET /healthz` until the control API will accept commands. `404`
counts as ready: the path is optional, and an answer at all means the control port is listening,
which is what readiness falls back to. `503` and a connection error are retried. There is
deliberately no settle delay after a control call to pair with it: every state-changing endpoint —
`/start`, `/change`, `/reset` — is specified not to return until the new state is actually being
served, so a fixed sleep afterwards would cover a window the API says is not there, and a suite that
slept instead of holding the backend to that promise would stop being able to detect the window
reopening. How long the _provider_ then takes to notice is a property of its transport, and that is
what `eventTimeoutMs` is for; the two must not be confused.

It prefers `POST /reset` for scenario isolation and falls back to `POST /start?config=default` on a
`404` or `501`, caching that decision once per suite. The fallback is the normal path rather than an
edge case — flagd-testbed's launchpad, the reference implementation, serves only `/start`,
`/restart`, `/stop` and `/change`. After a disconnect it always uses `/start`, because `/reset`
restores flag state and is not specified to start a stopped backend.

Two of the API's requirements are easy to get wrong:

- **Containers are never stopped or restarted mid-suite.** Unavailability is simulated _inside_ the
  running stack. Container orchestrators assign host ports dynamically and cannot reliably preserve
  them across a restart, so restarting silently invalidates every provider already pointed at the
  old port, and the failure looks like a flaky provider.
- **`/start` resets flag state; `/restart` preserves it.** An outage must be observable as a change
  in availability, never as a change in flag values.

A control written by hand also has to state **`controlApi`**: `'http'` if it drives a real backend
over the control API, `'in-process'` if it manipulates a provider that has no backend. It is a
required member with no default, and it is deliberately not inferred from the control's type. The
same scenarios passing over the control API and passing through in-process manipulation of a
provider that _does_ have a backend are not the same claim, and the report's `backend.controlApi` is
the only field that separates them — so an omitted value would not be "no claim made" but an
unfalsifiable one. `HttpControl` and `InProcessControl` answer it for you, which is why requiring it
costs almost nobody anything: from a Compose file you write no control at all.

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

| Suite                      | Subject                                               | Why                                                                                                                      |
| -------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `inMemory.spec.ts`         | the SDK's `InMemoryProvider`                          | reference adoption for a backend-less provider, and the Docker-free canary                                               |
| `controllable.spec.ts`     | a provider with a real `initialize` and `onClose`     | the only Docker-free cover for `lifecycle.feature`; see below                                                            |
| `extensionSuite.spec.ts`   | the same provider, plus `fixtures/extension-features` | reference adoption for a vendor with scenarios of its own, and the proof they share one lifecycle with the canonical set |
| `multiProvider.spec.ts`    | `MultiProvider` wrapping one child                    | delegation must be transparent                                                                                           |
| `inProcessControl.spec.ts` | `InProcessControl`                                    | pins what the Gherkin cannot assert about itself                                                                         |
| `httpControl.spec.ts`      | `HttpControl`                                         | pins the control-API request sequence and the readiness rules, without a container                                       |
| `compose.spec.ts`          | `runContainerizedProviderTck`'s refusals              | every refusal replaces a failure that would otherwise arrive minutes later as a container that never came up             |
| `underTest.spec.ts`        | `clientUnderTest` / `providerUnderTest`               | the failure modes a real run cannot reach: no suite, and two suites in one file                                          |

`controllable.spec.ts` exists because `inMemory.spec.ts` cannot cover the lifecycle feature and
never will. The SDK's `InMemoryProvider` implements **neither `initialize` nor `onClose`** — it is
handed its whole flag set by its constructor — and the SDK's registry marks a provider with no
`initialize` as `READY` the moment it is registered. So the readiness scenario would pass against it
having demonstrated nothing, which is exactly why that suite withholds `Lifecycle`, and why it is
right to.

The consequence was that **the shutdown and re-initialisation steps only ever executed through the
flagd adoption**, which is Docker-gated and excluded from CI — so in a normal run nothing exercised
them, and when they broke it surfaced inside a containerised provider suite where a TCK defect looks
like a provider defect. `ControllableProvider` acquires its flag store at `initialize()` time from a
store that can refuse it, which is enough for all six lifecycle scenarios: initialisation succeeds
observably, fails observably, shutdown releases and repeats, shutdown against a dead backend returns
promptly, and a provider offering reuse really is reusable.

It is composition rather than `extends InMemoryProvider`, and the reason was read out of the SDK's
build rather than assumed: `putConfiguration` ends with an unconditional
`events.emit(ConfigurationChanged, …)`, so a subclass seeding its flags at `initialize()` time would
announce a configuration change on every initialisation. A double that emits events the real thing
does not emit is worse than no double.

`ControllableProvider` is **not published**. It lives in `controllable.testkit.ts`, which
`tsconfig.lib.json` excludes exactly as it excludes the `.spec.ts` files, so it has no declaration in
`dist` and no route into the package. An adopter with no backend still uses `InProcessControl` and
the SDK's own provider — `inMemory.spec.ts` remains the reference adoption, and this is a strict
superset of its coverage rather than a replacement for it.

`multiProvider.spec.ts` wraps exactly one child deliberately. That is the interesting configuration
rather than a degenerate one: the correct answer is precisely what the in-memory suite already
asserts about the child alone, so any difference is attributable to the multi-provider and nothing
else — a variant that does not survive the hop, a reason rewritten to `DEFAULT`, an error code
flattened to `GENERAL`, an event that never reaches the client. The Java equivalent found a real bug
this way ([java-sdk#1882](https://github.com/open-feature/java-sdk/issues/1882)).

### What CI runs, and what it does not

Every suite in that table is **Docker-free** and runs in the default build, which is what makes
`inMemory.spec.ts` the canary: a break in the harness fails `nx test tck` with no container
anywhere.

**The containerised adoptions are deliberately excluded from the default build.** Why an adoption
suite is excluded rather than gating a merge is
[Appendix F, "Running the suite in CI"][appendix-f] — read it there rather than here, because four
READMEs restating it in four sets of words is how the reasoning drifted in the first place. What
belongs here is the mechanism, which is JavaScript's alone:

|       | where the exclusion lives                                                                                                                                                                                                          | how to run it                |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| flagd | `libs/providers/flagd/src/e2e/tck/jest.config.ts`, a Jest project of its own, reached only by a `tck` target in `project.json`. The pre-existing `e2e` config ignores that directory: `testPathIgnorePatterns: ['<rootDir>/tck/']` | `npx nx tck providers-flagd` |
| OFREP | `libs/providers/ofrep/src/e2e/tck/jest.config.ts`, likewise behind a `tck` target                                                                                                                                                  | `npx nx tck providers-ofrep` |

Nothing invokes a `tck` target: not `npm run e2e` (`nx run-many --all --target=e2e`), not a `test`
target, not any workflow in `.github/workflows`. Those two commands are the only ways in, and a
maintainer runs them before merging a change to the suite or to a provider it covers.

Appendix F names two mistakes, and both were made here before this shape existed. **An exclusion
something else undoes**: the suites originally sat in `libs/providers/flagd/src/e2e/tests/`, where
the pre-existing `e2e` target's Jest config swept them up through its default `testMatch` for no
better reason than the directory they were in — and that target _is_ a CI job in this repository,
which is why the boundary is now a directory with its own Jest project rather than a filename
pattern. **An exclusion nobody wrote down**: it is now written in three places, this section and a
"Running the conformance suite" section in each provider's own README.

Appendix F also asks that an excluded suite still **compile** in the default build, and JavaScript
does not deliver that for the two adoptions. `nx package providers-flagd` typechecks against
`tsconfig.lib.json`, which excludes `./src/e2e` wholesale; `nx test providers-flagd` ignores
`/e2e/`; and ESLint in this repository is not type-aware, so `nx lint` does not compile anything.
`npx nx tck providers-flagd` is therefore the only thing that compiles its own suite. Stated rather
than papered over. What would close it is a `tsc --noEmit -p libs/providers/flagd/tsconfig.spec.json`
step — that config does include `./src/e2e` — but it would also make this suite's branch answerable
for the pre-existing non-TCK e2e files in the same directory, so it is flagged for the provider's
owners rather than done here.

The harness's own suites are in the opposite position and do satisfy it: `nx test tck` runs them
through ts-jest with diagnostics on, so `controllable.testkit.ts` and every `.spec.ts` are
typechecked by the default build even where they are excluded from the package.

One JavaScript-specific cost worth naming: a conformance run pins its claim to an exact backend
image, so the image tag is part of the result. That is why the Compose files pin their tag instead of
following a submodule.

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
  the published library, so an `npm install` of `@openfeature/tck` is self-contained.
- **Contributors do.** Working on the TCK in this repository means the assets are read straight out
  of the submodule, so a checkout without it cannot load any feature file:

  ```sh
  git submodule update --init libs/shared/tck/spec
  ```

  `nx test tck` and `nx package tck` depend on the `pullSpec` target, which runs
  that for you. CI checks out with `submodules: recursive`.

`pullSpec` also regenerates [`src/lib/revision.ts`](./src/lib/revision.ts) from the submodule, so
the revision a conformance report names is refreshed by the same command that checks the artifacts
out. That file is committed, because a plain `jest` invocation does not go through Nx and a source
tree without git should still compile; if git or the submodule is unavailable the generator says so
and leaves the committed values alone rather than overwriting them with a guess.

Prettier is pointed away from `spec/` so it never rewrites artifacts that are consumed byte for byte
by every language's TCK.

## Known gaps

- **Evaluation context passthrough is verified only for the targeting key.** `targeting-key-flag`
  resolves differently for a matching context, so a provider that drops the context is caught by the
  resolved value itself — that is what the three `@targeting` scenarios do, and no echo operation is
  needed for it. What is still unverified is that the _whole_ context arrives intact: a provider that
  forwards the targeting key and silently discards every other attribute passes. Closing that needs
  either an echo operation on the control API or a second canonical flag whose rule keys on a custom
  attribute.
- **`POST /restart` is unused.** No current scenario needs a bounded outage — the stale scenario uses
  an explicit disconnect and reconnect — so `ConnectionControl` has no `disconnectFor`. The control
  API now marks the endpoint `[OPTIONAL]` for that reason. What would bring it back is a `@caching`
  scenario asserting what a stale provider serves _during_ an outage: that needs `/restart`'s
  preservation of flag state, which `/start` on reconnect does not give.
- **`@stale` has no Docker-free coverage**, and it is now the only capability that does not.
  `controllable.spec.ts` gave the lifecycle scenarios a suite that needs no container, but its
  in-process store can refuse an _initialisation_ — which is what `@unavailable` needs — and cannot
  take a store away from a running provider and give it back, which is what `@stale` needs. Closing
  it means that provider detecting a loss and emitting `PROVIDER_STALE` itself. The same gap exists
  in the other three languages.
- Caching, hooks and flag metadata are not covered. Provider metadata is, but only as far as a
  non-empty name. `@caching` is a reserved tag with no scenarios yet, and [Appendix F's caching
  entry][appendix-f] now carries the constraint whoever writes them will need — a provider may cache
  on the client side and rewrite the reason when it does, so a scenario that evaluates the same flag
  twice sees a different reason the second time from a provider that is behaving correctly.

[appendix-a]: https://github.com/open-feature/spec/blob/main/specification/appendix-a-included-utilities.md
[flagd-testbed]: https://github.com/open-feature/flagd-testbed
[coercion-adr]: https://github.com/open-feature/flagd/blob/main/docs/architecture-decisions/numeric-coercion.md
[messages]: https://github.com/cucumber/messages
[report-schema]: https://github.com/open-feature/spec/blob/main/specification/assets/provider-tck/report/conformance-report.schema.json
[appendix-f]: https://github.com/open-feature/spec/blob/main/specification/appendix-f-provider-conformance.md
[spec]: https://github.com/open-feature/spec
[tracking]: https://github.com/open-feature/spec/issues/417

/**
 * An optional part of the OpenFeature provider contract that a provider may or may not support.
 *
 * Not every provider implements every part of the specification. A provider backed by a static file
 * has no meaningful notion of going stale; one with no streaming transport cannot emit
 * configuration-change events. Rather than forcing such providers to fail scenarios they were never
 * going to satisfy, each declares what it supports through {@link TckOptions.capabilities}.
 *
 * Every capability corresponds to exactly one Gherkin tag. A scenario carrying a tag whose
 * capability was not declared is reported as **skipped, with the reason in the test name** — never
 * as passed. A conformance suite that quietly goes green on scenarios it did not run is worse than
 * no suite at all.
 *
 * Scenarios with no capability tag are mandatory and always run.
 */
export enum Capability {
  /** Provider emits lifecycle events at all — at minimum `PROVIDER_READY`. */
  Events = '@events',

  /**
   * Provider performs an initialisation that reaches its backend, with an observable outcome.
   *
   * This is deliberately not `@events`, and the distinction is load-bearing in both directions.
   *
   * A stateless provider — OFREP, or anything evaluating over a request-scoped call — cannot declare
   * `@events`, yet it may still have a real initialisation whose success or failure is worth
   * asserting. Gating the readiness scenarios on `@events` locked those providers out of scenarios
   * that were never about events.
   *
   * The reverse case is worse, because it goes green. Every SDK synthesises `PROVIDER_READY` for a
   * provider with no initialisation step, so a provider that declares `@events` but does nothing on
   * startup **passes the readiness scenario vacuously** — a `NoOpProvider` passes it identically,
   * having demonstrated nothing at all. A conformance suite whose scenarios can be satisfied without
   * exercising the behaviour they name is the failure mode this whole library exists to avoid.
   *
   * Declaring this therefore asserts something stronger than "events arrive": that initialisation
   * genuinely contacts the backend, and that both of its terminal outcomes — READY against a healthy
   * one, ERROR against an unreachable one — are observable.
   */
  Lifecycle = '@lifecycle',

  /**
   * Provider can be initialised again after `shutdown`, and serves flags afterwards.
   *
   * Separate from {@link Lifecycle} because the specification permits reuse rather than requiring
   * it.
   * [Requirement 2.5.2](https://github.com/open-feature/spec/blob/main/specification/sections/02-providers.md)
   * says a provider **SHOULD** revert to its uninitialized state after `shutdown`, and its
   * supporting text adds that *"some providers **may** allow reinitialization from this state"*. A
   * provider that releases its client on shutdown and declines to start again is exercising a
   * choice the specification offers it, not exhibiting a defect.
   *
   * The scenario it gates was originally untagged, on the reading that reverting to the
   * uninitialized state is observable as exactly one thing — that the provider can be initialised
   * again and then serves flags. That inference does not hold, and it cost something: a provider
   * making a permitted choice was reported as failing conformance, and the failure was on its way
   * to being filed as a defect against the implementation. A false failure is the mirror image of a
   * vacuous pass, and this vocabulary exists to prevent both.
   *
   * Reverting the state is not separately observable either — a provider that reverts but refuses
   * reuse presents exactly as one that did neither — so a gated reuse scenario is the only
   * assertion the requirement admits. It remains worth asserting for the providers that do offer
   * reuse, because releasing the client on shutdown while leaving an initialised flag set is easy
   * to write and leaves the provider evaluating against a closed connection rather than failing
   * outright.
   *
   * Declare it only if you have tested that reuse genuinely works. Leaving it undeclared is a
   * statement the specification sanctions, and needs no deviation recorded against it.
   */
  Reinitialization = '@reinitialization',

  /** Provider enters `STALE` and emits `PROVIDER_STALE` when it loses its backend. */
  Stale = '@stale',

  /** Provider detects configuration changes and emits `PROVIDER_CONFIGURATION_CHANGED`. */
  ConfigurationChange = '@configuration-change',

  /** Provider supports structured (object) flag values. */
  Object = '@object',

  /** Provider reports an error state promptly, rather than hanging, against an unreachable backend. */
  UnavailableInit = '@unavailable',

  /**
   * Provider coerces between the integer and float types only where the coercion is lossless, and
   * reports `TYPE_MISMATCH` where it would lose information.
   *
   * The rule has two halves and both are part of the contract. An integral float — `10.0` asked for
   * as an integer — must resolve, because the value the caller asked for is the value the flag
   * holds. A fractional one — `0.5` asked for as an integer — must fail, because narrowing it to
   * `0` loses information silently, which is the worst failure mode a feature flag has: the
   * application sees a plausible value and no error at all.
   *
   * The rule is flagd's
   * [numeric coercion ADR](https://github.com/open-feature/flagd/blob/main/docs/architecture-decisions/numeric-coercion.md),
   * and this capability is named for it. It was `@strict-numeric-typing`, which named the stricter
   * "never coerce" rule and so forbade the lossless case the ADR requires to work.
   *
   * The rule is borrowed, not normative. The specification has a single numeric type and says
   * nothing about what a provider owes a value that does not fit the accessor it was asked through
   * (open-feature/spec#430), so a provider that behaves differently is not violating it and this
   * capability is genuinely optional. A provider withholding it should still say which it is — a
   * deliberate choice, or a tracked defect.
   *
   * Both halves have scenarios. The lossy one asks for `float-flag` (`0.5`) as an integer and
   * expects `TYPE_MISMATCH`; the lossless ones ask for `integral-float-flag` (`10.0`) as an integer
   * and for `integer-flag` (`10`) as a float, and expect both to succeed. Rejecting every float is
   * an easy way to pass the first, and the other two are what stop it.
   *
   * **JavaScript has no integer type, so this is the one capability that cannot hold here at all.**
   * `typeof 10` and `typeof 0.5` are both `'number'` and the Evaluation API exposes only
   * `getNumberDetails`, so requesting a flag as an Integer is indistinguishable from requesting it
   * as a Float. Neither half of the contract can be put to a provider in this language: there is no
   * lossless coercion to permit, because `10.0` and `10` are the same value and nothing is
   * narrowed, and no lossy one to reject with `TYPE_MISMATCH`, because `0.5` asked for as an
   * Integer is indistinguishable from a perfectly valid Float request.
   *
   * A JavaScript suite therefore leaves this undeclared, and its three scenarios are skipped with
   * that reason. **This paragraph is where the impossibility is recorded**, together with Appendix
   * F upstream — not a field in every report. It is a property of the SDK rather than of any one
   * provider: true of every provider written against this SDK, and for as long as the Evaluation
   * API has a single numeric accessor. Stating it per run would repeat a language fact on each
   * provider's behalf and still say nothing in a run where no scenario carried the tag.
   */
  NumericCoercion = '@numeric-coercion',

  /**
   * Provider resolves integers up to 2^53 − 1 exactly.
   *
   * Accessor width is a property of the SDK rather than of the provider, which is why it is modelled
   * apart from {@link NumericCoercion}. Every language's integer accessor can ask for 2^31 − 1, so
   * that precision scenario is untagged and mandatory. Only some can ask for 2^53 − 1: Java's
   * accessor is a 32-bit `Integer`, and a provider cannot resolve a value the accessor has no room
   * for, so a provider on a 32-bit accessor leaves this undeclared.
   *
   * JavaScript's `number` represents every integer up to 2^53 − 1 exactly, so a provider here can
   * declare it whenever its backend and transport carry the value without rounding. Nothing above
   * 2^53 − 1 is asked for: JavaScript cannot represent it.
   */
  LargeIntegers = '@large-integers',

  /**
   * Reserved. No scenario carries this tag — targeting is backend evaluation logic.
   *
   * Reserved means **not declarable**; see {@link RESERVED_CAPABILITIES}.
   */
  Targeting = '@targeting',

  /**
   * Reserved; no scenario carries this tag yet.
   *
   * Reserved means **not declarable**; see {@link RESERVED_CAPABILITIES}.
   */
  Caching = '@caching',
}

/**
 * The capabilities that exist in the vocabulary but that no scenario carries.
 *
 * A reserved tag is a name held open for a scenario that has not been written yet. Until one is, the
 * capability gates nothing, so it **must not be declared** and must not appear in a conformance
 * report's `declaration.declared`: a capability no executed scenario carries cannot produce a skip,
 * which means it plays no part in reading the results and listing it only invites a reader to
 * believe something was verified when nothing examined it. That is the vacuous conformance claim the
 * capability vocabulary exists to prevent.
 *
 * It is not a hypothetical. A published Java conformance report asserted both of these as declared
 * — not by anyone's decision, but because that adoption declares "every capability except X" and
 * picked up every reserved tag in the vocabulary on the way past.
 *
 * One list, in one place, because the failure mode is the rule and the list drifting apart. The
 * harness also checks it against the feature files it actually ran, so a reservation that expires
 * upstream is reported rather than silently outliving the scenario that ended it.
 *
 * @see https://github.com/open-feature/spec/blob/main/specification/assets/provider-tck/report/conformance-report.schema.json
 */
export const RESERVED_CAPABILITIES: readonly Capability[] = Object.freeze([Capability.Targeting, Capability.Caching]);

/** Whether a capability is reserved, and so cannot be declared. */
export function isReserved(capability: Capability): boolean {
  return RESERVED_CAPABILITIES.includes(capability);
}

/**
 * Every capability the TCK recognises as a tag, reserved ones included.
 *
 * This is the vocabulary, not the set an adopter may declare — for that see
 * {@link DECLARABLE_CAPABILITIES}. Reserved tags belong here because a tag still has to be
 * recognised to be refused.
 */
export const ALL_CAPABILITIES: readonly Capability[] = Object.freeze(Object.values(Capability));

/**
 * Every capability an adoption may declare: {@link ALL_CAPABILITIES} without the reserved ones.
 *
 * A reasonable starting point for a new adoption: declare all of these, run the suite, and remove
 * only what the provider genuinely cannot do. Narrowing from the full set surfaces gaps; widening
 * towards it hides them. It is also what {@link TckOptions.capabilities} defaults to, so
 * "declare everything" cannot mean "declare things nothing tested".
 */
export const DECLARABLE_CAPABILITIES: readonly Capability[] = Object.freeze(
  ALL_CAPABILITIES.filter((capability) => !isReserved(capability)),
);

/**
 * Maps a Gherkin tag onto the capability it gates, or `undefined` if it gates nothing.
 *
 * A tag that gates nothing is ignored, which is what lets the canonical feature files carry
 * organisational tags freely.
 */
export function capabilityForTag(tag: string): Capability | undefined {
  return ALL_CAPABILITIES.find((capability) => capability === tag);
}

/**
 * Reserved capabilities that a scenario in the executed features turns out to carry.
 *
 * A non-empty answer means {@link RESERVED_CAPABILITIES} is now wrong: the scenario the tag was
 * being held open for exists, so the capability is testable and an adoption should be allowed — and
 * required — to say whether it has it. Checked against what actually ran, because the reservation
 * expires in the specification repository and this list lives here.
 */
export function expiredReservations(tags: Iterable<string>): Capability[] {
  const carried = new Set<string>(tags);
  return RESERVED_CAPABILITIES.filter((capability) => carried.has(capability));
}

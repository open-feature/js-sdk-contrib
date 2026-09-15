/**
 * An optional part of the OpenFeature provider contract that a provider may or may not support.
 *
 * Every capability is exactly one Gherkin tag, and a scenario carrying an undeclared one is
 * reported as skipped with the reason rather than passed. What each tag means, what composing them
 * implies and when to declare one are
 * [Appendix F, "Capabilities"](https://github.com/open-feature/spec/blob/main/specification/appendix-f-provider-conformance.md);
 * the notes below add only what is JavaScript's.
 *
 * Scenarios with no capability tag are mandatory and always run.
 */
export enum Capability {
  /** Provider emits lifecycle events at all — at minimum `PROVIDER_READY`. */
  Events = '@events',

  /** Provider performs an initialisation that reaches its backend, with an observable outcome. */
  Lifecycle = '@lifecycle',

  /** Provider can be initialised again after `shutdown`, and serves flags afterwards. */
  Reinitialization = '@reinitialization',

  /** Provider enters `STALE` and emits `PROVIDER_STALE` when it loses its backend. */
  Stale = '@stale',

  /** Provider detects configuration changes and emits `PROVIDER_CONFIGURATION_CHANGED`. */
  ConfigurationChange = '@configuration-change',

  /** Provider supports structured (object) flag values. */
  Object = '@object',

  /**
   * Provider names the variant it resolved, which requirement 2.2.4 makes a `SHOULD`.
   *
   * Withholding it costs nothing else: the value and reason assertions are untagged and unaffected,
   * requirement 2.2.3 making the value a `MUST`.
   */
  Variants = '@variants',

  /**
   * Provider resolves a flag disabled in the flag management system to the caller's default.
   *
   * Gated because what a disabled flag resolves to is a property of **where the substitution
   * happens** rather than of provider quality. Only the caller has the default, so the question is
   * whether it is in hand at the point the flag's state is read — and where it is not, whether the
   * wire format can say *"no value"* plainly enough for the client to put it in. A provider whose
   * backend answers with the flag's *configured* value, or with an error, has no hook to substitute
   * on and genuinely cannot have the capability; that is a property of the provider and its backend
   * together, which is why declaring it is a claim about the pair a run was made against.
   *
   * Nothing in the specification says what a provider owes a disabled flag: requirement 1.4.7 is
   * about the SDK propagating whatever reason arrived, and 2.2.5 only lists `DISABLED` among the
   * reason strings a provider may use. So Appendix F states the behaviour, as it does for
   * {@link NumericCoercion}, and gates it.
   *
   * The four rows assert the **value** and the absence of an error, and deliberately not the reason.
   * Each row's caller default differs from the flag's configured value, so a provider that ignores
   * the state returns the configured value and is caught on the value alone — which rests on
   * requirement 2.2.3, a `MUST`. Pinning reason `DISABLED` would rest on 2.2.5, a `SHOULD` that
   * expressly permits *"some other string"*; that assertion lives behind
   * {@link StandardReasons} instead.
   *
   * No variant is asserted either. A disabled flag has resolved no variant, so this capability and
   * {@link Variants} deliberately do not compose — which is also why the rows are scalar-only and
   * there is no disabled object flag: a row needing both `@object` and this tag could not be one row
   * of a single outline.
   */
  DisabledFlags = '@disabled-flags',

  /** Provider reports an error state promptly, rather than hanging, against an unreachable backend. */
  UnavailableInit = '@unavailable',

  /**
   * Provider coerces between the integer and float types only where the coercion is lossless, and
   * reports `TYPE_MISMATCH` where it would lose information.
   *
   * The rule is flagd's
   * [numeric coercion ADR](https://github.com/open-feature/flagd/blob/main/docs/architecture-decisions/numeric-coercion.md),
   * borrowed rather than normative — the specification has a single numeric type and says nothing
   * about it ([open-feature/spec#430](https://github.com/open-feature/spec/issues/430)).
   *
   * **This SDK cannot express it, so it is refused rather than left to adopters** — see
   * {@link INEXPRESSIBLE_CAPABILITIES}.
   */
  NumericCoercion = '@numeric-coercion',

  /**
   * Provider resolves integers up to 2^53 − 1 exactly.
   *
   * Accessor width is a property of the SDK rather than of the provider, which is why it is modelled
   * apart from {@link NumericCoercion}. `number` represents every integer up to 2^53 − 1 exactly, so
   * this is an ordinary declarable capability here — unlike in Java, whose 32-bit accessor makes it
   * that implementation's inexpressible one. Declare it whenever the backend and transport carry the
   * value without rounding. Nothing above 2^53 − 1 is asked for: JavaScript cannot represent it.
   */
  LargeIntegers = '@large-integers',

  /**
   * Provider resolves a flag differently for a matching evaluation context.
   *
   * Three scenarios, and all three are needed. A matching context resolves the targeted variant; a
   * non-matching one resolves the default, without which a provider that always returned the
   * targeted value would pass; and an absent context resolves the default without erroring, which
   * catches a provider that requires a targeting key or cannot evaluate a rule without one.
   *
   * A provider whose backend has no targeting at all leaves this undeclared and the three scenarios
   * skip with that reason. The suites in this package are in exactly that position — see
   * {@link canonicalFlagSet}.
   */
  Targeting = '@targeting',

  /**
   * Provider reports the standard resolution reasons, with the meanings Appendix F gives them.
   *
   * A claim rather than an exemption, and **expressible here** unlike {@link NumericCoercion}: a
   * reason is a string on the resolution details, observable through `getBooleanDetails` and its
   * siblings whatever the accessor's arithmetic. That is why
   * {@link INEXPRESSIBLE_CAPABILITIES} names one capability and not a category.
   */
  StandardReasons = '@standard-reasons',

  /**
   * Provider reports `TYPE_MISMATCH` for a non-string flag requested through the string accessor.
   *
   * Gated for the same reason as {@link NumericCoercion}: the answer depends on the backend rather
   * than on provider quality, and the specification does not settle it. Every value has a string
   * representation, so a backend that stores flag values as strings satisfies the string accessor
   * for every flag and has no mismatch to report — requirement 2.2.3 asks it for the resolved flag
   * value, and a string is what it holds. The only normative statement anywhere near this is
   * requirement 1.3.4, a `SHOULD` on the **client** rather than on the provider.
   *
   * So a provider over an untyped backend withholds the tag, sees the four scenarios skipped, and
   * is not thereby non-conformant. That is a declaration decision, not a deviation: nothing is
   * broken, so a {@link KnownDeviation} against this tag would report a sanctioned choice as a
   * defect.
   *
   * Four scenarios: three scalar rows requesting `boolean-flag`, `integer-flag` and `float-flag` as
   * `String`, and one that composes with {@link Object} for `object-flag` — a structure serialises
   * to a string as readily as a scalar does, but a provider with no structured values cannot be
   * asked the question at all. All four were rows of the mandatory mismatch matrix until Appendix F
   * moved them behind this tag.
   *
   * Unlike {@link NumericCoercion} this **is** expressible here: `getStringDetails` is a distinct
   * accessor from `getBooleanDetails`, so the question can be put to a provider whatever
   * JavaScript's numeric type does.
   */
  StringTyping = '@string-typing',

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
 * A reserved tag gates nothing, so it must not be declared and must not reach a conformance
 * report's `declaration.declared` — Appendix F's reserved-capability rules say why. One list, in one
 * place, because the failure mode is the rule and the list drifting apart. {@link expiredReservations}
 * checks it against the features that actually ran, so a reservation expiring upstream is reported
 * rather than silently outliving the scenario that ended it.
 *
 * @see https://github.com/open-feature/spec/blob/main/specification/assets/provider-tck/report/conformance-report.schema.json
 */
export const RESERVED_CAPABILITIES: readonly Capability[] = Object.freeze([Capability.Caching]);

/** Whether a capability is reserved, and so cannot be declared. */
export function isReserved(capability: Capability): boolean {
  return RESERVED_CAPABILITIES.includes(capability);
}

/**
 * The capabilities this SDK cannot put to a provider at all, each mapped to the reason it cannot.
 *
 * **This is the one place the language property is written down**, which is what Appendix F asks of
 * an implementation: a capability the language's SDK cannot express is refused here, at
 * configuration time, rather than left to every adopter to leave out. A capability listed here can
 * never reach `declared`, and its scenarios are skipped in every run carrying the reason below.
 *
 * `@numeric-coercion` is the only one, because JavaScript has a single numeric type and so a single
 * `getNumberDetails` accessor; the README's "JavaScript notes" has the full reading.
 *
 * **This is not a reservation, and the two must not be read as one** — a reservation is global and
 * expires, this is one language's and permanent, and only the refusal is shared. That is why they
 * are separate predicates with separate messages rather than one shared "not declarable".
 *
 * The reason strings are short on purpose: each is quoted verbatim in the configuration-time refusal
 * and in every skipped scenario's name, so a reader of a run sees *why* without a lookup.
 */
export const INEXPRESSIBLE_CAPABILITIES: Readonly<Partial<Record<Capability, string>>> = Object.freeze({
  [Capability.NumericCoercion]:
    'JavaScript has a single numeric type, so "a float requested as an integer" is not expressible',
});

/** Whether a capability is one this SDK cannot express, and so cannot be declared here. */
export function isInexpressible(capability: Capability): boolean {
  return INEXPRESSIBLE_CAPABILITIES[capability] !== undefined;
}

/**
 * Why this SDK cannot express a capability, or `undefined` where it can.
 *
 * One accessor for one sentence, so the refusal and the skip cannot word it differently.
 */
export function inexpressibleReason(capability: Capability): string | undefined {
  return INEXPRESSIBLE_CAPABILITIES[capability];
}

/**
 * Every capability the TCK recognises as a tag, reserved and inexpressible ones included.
 *
 * This is the vocabulary, not the set an adopter may declare — for that see
 * {@link DECLARABLE_CAPABILITIES}. Both kinds of undeclarable tag belong here because a tag still
 * has to be recognised to be refused, and an inexpressible one has to be recognised to be *gated*:
 * its scenarios exist and must be skipped with their reason.
 */
export const ALL_CAPABILITIES: readonly Capability[] = Object.freeze(Object.values(Capability));

/**
 * Every capability an adoption may declare: {@link ALL_CAPABILITIES} without the two kinds it may
 * not — the reserved ones, and the ones {@link INEXPRESSIBLE_CAPABILITIES} says this SDK cannot ask.
 *
 * A reasonable starting point for a new adoption: declare all of these, run the suite, and remove
 * only what the provider genuinely cannot do. Narrowing from the full set surfaces gaps; widening
 * towards it hides them. It is also what {@link TckOptions.capabilities} defaults to, so "declare
 * everything" cannot mean "declare things nothing tested".
 *
 * The two exclusions differ in what they leave behind. A reserved capability gates nothing, so its
 * absence here is invisible at run time. An inexpressible one gates three scenarios that are skipped
 * in every run of every JavaScript suite, which is why it is excluded here and *not* from the
 * capability gate.
 */
export const DECLARABLE_CAPABILITIES: readonly Capability[] = Object.freeze(
  ALL_CAPABILITIES.filter((capability) => !isReserved(capability) && !isInexpressible(capability)),
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

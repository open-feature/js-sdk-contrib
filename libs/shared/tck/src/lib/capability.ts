/**
 * An optional part of the OpenFeature provider contract that a provider may or may not support.
 *
 * Every capability is exactly one Gherkin tag, and a scenario carrying an undeclared one is
 * reported as skipped with the reason rather than passed. Scenarios with no capability tag are
 * mandatory and always run.
 *
 * What each tag means, what composing them implies and when to declare one are
 * [Appendix F, "Capabilities"](https://github.com/open-feature/spec/blob/main/specification/appendix-f-provider-conformance.md).
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

  /** Provider names the variant it resolved. */
  Variants = '@variants',

  /**
   * Provider resolves a flag disabled in the flag management system to the caller's default.
   *
   * Declaring it is a claim about the provider and its backend together: a backend that answers
   * with the flag's configured value, or with an error, leaves the provider no hook to substitute
   * on.
   */
  DisabledFlags = '@disabled-flags',

  /** Provider reports an error state promptly, rather than hanging, against an unreachable backend. */
  UnavailableInit = '@unavailable',

  /**
   * Provider coerces between the integer and float types only where the coercion is lossless, and
   * reports `TYPE_MISMATCH` where it would lose information.
   *
   * **This SDK cannot express it, so it is refused rather than left to adopters** — see
   * {@link INEXPRESSIBLE_CAPABILITIES}.
   */
  NumericCoercion = '@numeric-coercion',

  /**
   * Provider resolves integers up to 2^53 − 1 exactly.
   *
   * Declare it whenever the backend and transport carry the value without rounding. Nothing above
   * 2^53 − 1 is asked for: JavaScript cannot represent it.
   */
  LargeIntegers = '@large-integers',

  /**
   * Provider resolves a flag differently for a matching evaluation context.
   *
   * A provider whose backend has no targeting at all leaves this undeclared and its scenarios skip
   * with that reason. The suites in this package are in exactly that position — see
   * {@link canonicalFlagSet}.
   */
  Targeting = '@targeting',

  /** Provider reports the standard resolution reasons, with the meanings Appendix F gives them. */
  StandardReasons = '@standard-reasons',

  /**
   * Provider reports `TYPE_MISMATCH` for a boolean or integer flag requested through the string
   * accessor, rather than that value's string representation.
   *
   * Withholding it is a declaration decision and not a deviation: a backend that stores flag values
   * as strings satisfies the string accessor for every flag and has no mismatch to report.
   * Declaring it and failing is a defect in the provider, which is why the float and structured
   * cases live behind {@link FullyTypedValues} instead of under this tag.
   */
  StringTyping = '@string-typing',

  /**
   * Backend records a native type for float and structured values too, so {@link StringTyping}'s
   * question can be put to those as well.
   *
   * Declared together with {@link StringTyping} by a fully typed backend, and withheld alone by a
   * partially typed one. A capability coarser than the variation providers actually show would hide
   * the defects {@link StringTyping} catches inside this permitted absence.
   */
  FullyTypedValues = '@fully-typed-values',

  /**
   * Reserved, and so not declarable; see {@link RESERVED_CAPABILITIES}. No scenario carries it yet.
   */
  Caching = '@caching',
}

/**
 * The capabilities that exist in the vocabulary but that no scenario carries.
 *
 * A reserved tag gates nothing, so it must not be declared and must not reach a conformance
 * report's `declaration.declared`. {@link expiredReservations} checks this list against the
 * features that actually ran, so a reservation expiring upstream is reported rather than silently
 * outliving the scenario that ended it.
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
 * A capability listed here is refused at configuration time rather than left to every adopter to
 * leave out: it can never reach `declared`, and its scenarios are skipped in every run carrying the
 * reason below. This is not a reservation and the two must not be collapsed into one predicate — a
 * reservation is global and expires, this is one language's and permanent, and only the refusal is
 * shared.
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
 * The vocabulary, not the set an adopter may declare — for that see {@link DECLARABLE_CAPABILITIES}.
 * Both kinds of undeclarable tag belong here because a tag still has to be recognised to be
 * refused, and an inexpressible one has to be recognised to be *gated*: its scenarios exist and must
 * be skipped with their reason.
 */
export const ALL_CAPABILITIES: readonly Capability[] = Object.freeze(Object.values(Capability));

/**
 * Every capability an adoption may declare: {@link ALL_CAPABILITIES} without the reserved ones and
 * the ones {@link INEXPRESSIBLE_CAPABILITIES} says this SDK cannot ask.
 *
 * A reasonable starting point for a new adoption: declare all of these, run the suite, and remove
 * only what the provider genuinely cannot do. It is also what {@link TckOptions.capabilities}
 * defaults to, so "declare everything" cannot mean "declare things nothing tested".
 */
export const DECLARABLE_CAPABILITIES: readonly Capability[] = Object.freeze(
  ALL_CAPABILITIES.filter((capability) => !isReserved(capability) && !isInexpressible(capability)),
);

/**
 * Maps a Gherkin tag onto the capability it gates, or `undefined` if this vocabulary does not know
 * it.
 */
export function capabilityForTag(tag: string): Capability | undefined {
  return ALL_CAPABILITIES.find((capability) => capability === tag);
}

/**
 * Tags carried by the canonical scenarios that this vocabulary cannot resolve to a capability.
 *
 * A non-empty answer means the assets have moved ahead of {@link Capability}: a new capability
 * arrived upstream and was not registered here. Appendix F makes failing the run on this a `MUST`,
 * and the hole is silent — an unknown tag gates nothing, so its scenarios stay *mandatory for every
 * adopter* and only the adoption that legitimately withholds the new tag sees unexplained failures.
 * Measured here rather than assumed: at the revision that split `@string-typing`, with the enum
 * untouched, the newly split scenario ran and *passed* for every suite in this repository.
 *
 * **Canonical scenarios only**, so an adopter's own extension tags stay tolerated. Every tag in the
 * canonical set is a capability tag, so the rule can be this strict there and no looser test could
 * tell an unregistered capability from a label.
 */
export function unknownCapabilityTags(tags: Iterable<string>): string[] {
  return Array.from(new Set(tags))
    .filter((tag) => capabilityForTag(tag) === undefined)
    .sort();
}

/**
 * Reserved capabilities that a scenario in the executed features turns out to carry.
 *
 * A non-empty answer means {@link RESERVED_CAPABILITIES} is now wrong: the scenario the tag was held
 * open for exists, so an adoption should be required to say whether it has the capability. Checked
 * against what actually ran, because the reservation expires in the specification repository while
 * this list lives here.
 */
export function expiredReservations(tags: Iterable<string>): Capability[] {
  const carried = new Set<string>(tags);
  return RESERVED_CAPABILITIES.filter((capability) => carried.has(capability));
}

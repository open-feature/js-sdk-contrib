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

  /** Provider enters `STALE` and emits `PROVIDER_STALE` when it loses its backend. */
  Stale = '@stale',

  /** Provider detects configuration changes and emits `PROVIDER_CONFIGURATION_CHANGED`. */
  ConfigurationChange = '@configuration-change',

  /** Provider supports structured (object) flag values. */
  Object = '@object',

  /** Provider reports an error state promptly, rather than hanging, against an unreachable backend. */
  UnavailableInit = '@unavailable',

  /**
   * Provider keeps the integer and float types distinct instead of coercing between them.
   *
   * Unlike every other entry here this is **not** an optional feature. The specification requires a
   * provider to report `TYPE_MISMATCH` when the requested type cannot be satisfied, and narrowing
   * `0.5` to `0` loses information silently — the worst failure mode a feature flag has, because the
   * application sees a plausible value and no error at all.
   *
   * It is a capability only so that a provider with this defect can adopt the suite today and see
   * the gap reported as an explicit skip, rather than being unable to adopt at all. Not declaring it
   * is an admission of a known bug, not a design choice.
   *
   * JavaScript has no integer type, so this is the one capability whose meaning differs here: the
   * suite can only check that a float is not silently truncated, not that the two types are
   * represented distinctly.
   */
  StrictNumericTyping = '@strict-numeric-typing',

  /** Reserved. No scenario carries this tag — targeting is backend evaluation logic. */
  Targeting = '@targeting',

  /** Reserved; no scenario carries this tag yet. */
  Caching = '@caching',
}

/**
 * Every capability the TCK recognises.
 *
 * A reasonable starting point for a new adoption: declare everything, run the suite, and remove only
 * what the provider genuinely cannot do. Narrowing from the full set surfaces gaps; widening towards
 * it hides them.
 */
export const ALL_CAPABILITIES: readonly Capability[] = Object.freeze(Object.values(Capability));

/**
 * Maps a Gherkin tag onto the capability it gates, or `undefined` if it gates nothing.
 *
 * A tag that gates nothing is ignored, which is what lets the canonical feature files carry
 * organisational tags freely.
 */
export function capabilityForTag(tag: string): Capability | undefined {
  return ALL_CAPABILITIES.find((capability) => capability === tag);
}

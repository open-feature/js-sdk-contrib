import type { Capability } from './capability';

/**
 * A gap the provider is known to have against something the specification does not treat as optional.
 *
 * **An entry says: this provider fails to do something it is required to do.** Which shape to reach
 * for — capability declared and the scenario left failing, or capability withheld and the scenarios
 * skipped — is
 * [Appendix F, "Rules for declaring"](https://github.com/open-feature/spec/blob/main/specification/appendix-f-provider-conformance.md).
 * The TCK cannot infer it: from the outside, a capability withheld by choice and one withheld because
 * it is broken are the same absence.
 *
 * The field names are Java's rather than paraphrases, so two languages' reports of the same defect
 * are comparable without a translation table.
 */
export interface KnownDeviation {
  /** The capability tag the deviation concerns, absent when it maps to none. */
  readonly capability?: Capability;

  /** Where the gap is tracked, absent when it is not tracked anywhere. */
  readonly issue?: string;

  /**
   * What the gap is, in a form someone comparing providers can use. Required: an entry with no
   * summary is worth less than the bare skip or failure it accompanies.
   */
  readonly summary: string;
}

/**
 * Builds a {@link KnownDeviation}.
 *
 * Two factories rather than one optional argument: "not tracked anywhere" is a claim an adopter
 * should have to make on purpose, where one factory would make it indistinguishable from a forgotten
 * argument.
 */
export const KnownDeviation = {
  /**
   * Records a deviation that is tracked somewhere.
   *
   * @param capability the capability the gap concerns, or `undefined` against a mandatory scenario
   * @param issue a URI where the gap is tracked
   * @param summary what the gap is
   */
  tracked(capability: Capability | undefined, issue: string, summary: string): KnownDeviation {
    return Object.freeze({ ...(capability ? { capability } : {}), issue, summary });
  },

  /**
   * Records a deviation that is not tracked anywhere yet. Worth declaring even so, because naming
   * the defect is what separates it from a capability the provider chose to withhold. Prefer
   * {@link KnownDeviation.tracked} as soon as there is an issue to point at.
   *
   * @param capability the capability the gap concerns, or `undefined` against a mandatory scenario
   * @param summary what the gap is
   */
  untracked(capability: Capability | undefined, summary: string): KnownDeviation {
    return Object.freeze({ ...(capability ? { capability } : {}), summary });
  },
} as const;

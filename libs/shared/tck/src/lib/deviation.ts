import type { Capability } from './capability';

/**
 * A gap the provider is known to have against something the specification does not treat as
 * optional.
 *
 * **An entry says: this provider fails to do something it is required to do.** Which shape to reach
 * for — capability declared and the scenario left failing, or capability withheld and the scenarios
 * skipped — is
 * [Appendix F, "Rules for declaring"](https://github.com/open-feature/spec/blob/main/specification/appendix-f-provider-conformance.md),
 * and it is the most consequential thing about this field. Read it before writing one.
 *
 * The TCK cannot infer any of it. From the outside, a capability the provider chose to withhold and
 * one it withheld because it is broken are the same absence, so only the adopter can say which
 * happened — which is why this is declared through {@link TckOptions.knownDeviations}, alongside
 * {@link TckOptions.capabilities}.
 *
 * Part of the declaration vocabulary rather than of any one consumer of it. This is something an
 * adopter *writes*, so it belongs to the suite an adopter adopts; whatever reads the declaration —
 * a machine-readable conformance report, a build check, a human — is downstream of it and does not
 * widen it.
 *
 * The field names are Java's (`capability`, `issue`, `summary`) rather than paraphrases of them, so
 * that two languages' reports of the same defect are comparable without a translation table.
 */
export interface KnownDeviation {
  /** The capability tag the deviation concerns, absent when it maps to none. */
  readonly capability?: Capability;

  /** Where the gap is tracked, absent when it is not tracked anywhere. */
  readonly issue?: string;

  /**
   * What the gap is, in a form someone comparing providers can use.
   *
   * Required. An entry with no summary records that something is wrong without saying what, which
   * is worth less than the bare skip or failure it accompanies.
   */
  readonly summary: string;
}

/**
 * Builds a {@link KnownDeviation}.
 *
 * Two factories rather than one optional argument, because "not tracked anywhere" is a statement an
 * adopter should have to make on purpose. An omitted issue URL and an untracked defect are the same
 * value and very different claims, and a single factory makes the first indistinguishable from a
 * forgotten argument.
 */
export const KnownDeviation = {
  /**
   * Records a deviation that is tracked somewhere.
   *
   * @param capability the capability the gap concerns, or `undefined` when the gap is against a
   *   mandatory scenario and so belongs to no capability
   * @param issue a URI where the gap is tracked
   * @param summary what the gap is
   */
  tracked(capability: Capability | undefined, issue: string, summary: string): KnownDeviation {
    return Object.freeze({ ...(capability ? { capability } : {}), issue, summary });
  },

  /**
   * Records a deviation that is not tracked anywhere yet.
   *
   * Worth declaring even so. Naming the defect is what separates it from a capability the provider
   * chose to withhold, and a declaration that merely omits the tag cannot say which of the two
   * happened. Prefer {@link KnownDeviation.tracked} as soon as there is an issue to point at.
   *
   * @param capability the capability the gap concerns, or `undefined` when the gap is against a
   *   mandatory scenario and so belongs to no capability
   * @param summary what the gap is
   */
  untracked(capability: Capability | undefined, summary: string): KnownDeviation {
    return Object.freeze({ ...(capability ? { capability } : {}), summary });
  },
} as const;

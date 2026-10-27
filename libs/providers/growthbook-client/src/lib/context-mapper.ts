import type { EvaluationContext } from '@openfeature/web-sdk';
import type { Attributes } from '@growthbook/growthbook';

/**
 * Convert an OpenFeature evaluation context into GrowthBook attributes.
 *
 * GrowthBook buckets on the `id` attribute by default, while OpenFeature carries
 * the subject in `targetingKey`. Without this mapping GrowthBook receives an
 * attribute literally named `targetingKey` and nothing named `id`, so percentage
 * rollouts return their default and experiments never assign a variation --
 * silently, because a missing hash attribute is not an error.
 *
 * An explicitly supplied `id` wins over `targetingKey`: setting both is the
 * portable pattern, and the caller's named attribute should not be overwritten.
 * The targeting key is also forwarded under its own name, preserving the
 * provider's original pass-through behaviour for rules that reference it.
 */
export function toAttributes(context: EvaluationContext): Attributes {
  // The whole context passes through unchanged, targetingKey included: the
  // provider historically forwarded the evaluation context verbatim, so
  // GrowthBook rules or custom-hash rollouts written against a "targetingKey"
  // attribute must keep matching.
  const attributes: Attributes = { ...context };

  if (context.targetingKey !== undefined && attributes['id'] === undefined) {
    attributes['id'] = context.targetingKey;
  }

  return attributes;
}

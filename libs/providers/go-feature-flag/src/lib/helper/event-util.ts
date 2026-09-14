import type { EvaluationContext } from '@openfeature/core';

/**
 * Get the context kind based on the evaluation context.
 *
 * A boolean `true` yields `anonymousUser`, and so does an absent context: with no context there is
 * no targeting key to identify anyone by, so the evaluation is anonymous by construction. Every
 * other case - `false`, an absent attribute, a non-boolean value - is a `user`. The identity test
 * on `anonymous` is deliberate: a truthiness test agrees on the common cases and diverges on the
 * rest, so `anonymous: 'false'` from a string-typed source would flip the bucket.
 * @param context - The evaluation context to check
 * @returns 'anonymousUser' when the context is absent or `anonymous` is boolean true, 'user' otherwise
 */
export const getContextKind = (context?: EvaluationContext): string => {
  return !context || context['anonymous'] === true ? 'anonymousUser' : 'user';
};

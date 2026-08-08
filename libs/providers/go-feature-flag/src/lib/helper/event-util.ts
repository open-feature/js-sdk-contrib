import type { EvaluationContext } from '@openfeature/core';

/**
 * Get the context kind based on the evaluation context.
 *
 * Only a boolean `true` yields `anonymousUser`. Everything else - `false`, an absent attribute, a
 * non-boolean value, and an absent context - is a `user`. The identity test is deliberate: a
 * truthiness test agrees on the common cases and diverges on the rest, so `anonymous: 'false'`
 * from a string-typed source would flip the bucket.
 * @param context - The evaluation context to check
 * @returns 'anonymousUser' when `anonymous` is boolean true, 'user' otherwise
 */
export const getContextKind = (context?: EvaluationContext): string => {
  return context?.['anonymous'] === true ? 'anonymousUser' : 'user';
};

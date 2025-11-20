import type { EvaluationContext } from '@openfeature/core';

/**
 * Get the context kind based on the evaluation context.
 * @param context - The evaluation context to check
 * @returns 'anonymous' if the context is anonymous, 'user' otherwise
 */
export const getContextKind = (context?: EvaluationContext): string => {
  return !context || context['anonymous'] === true ? 'anonymousUser' : 'user';
};

import type { EvaluationContext } from '@openfeature/server-sdk';
import type { ITargetingContext } from '@microsoft/feature-management';

/**
 * Maps an OpenFeature {@link EvaluationContext} to the Azure feature-management
 * {@link ITargetingContext}.
 *
 * - `targetingKey` maps to `userId`.
 * - a `groups` attribute (array of strings) maps to `groups`.
 */
export function transformContext(context: EvaluationContext): ITargetingContext {
  const groups = context['groups'];

  return {
    userId: context.targetingKey,
    groups: Array.isArray(groups) ? groups.filter((group): group is string => typeof group === 'string') : undefined,
  };
}

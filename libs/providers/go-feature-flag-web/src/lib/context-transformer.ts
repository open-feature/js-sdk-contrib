import type { GoFeatureFlagEvaluationContext } from './model';
import type { EvaluationContext } from '@openfeature/web-sdk';
import { TargetingKeyMissingError } from '@openfeature/web-sdk';

/**
 * transformContext takes the raw OpenFeature context returns a GoFeatureFlagEvaluationContext.
 * @param context - the context used for flag evaluation.
 * @returns {GoFeatureFlagEvaluationContext} the user against who we will evaluate the flag.
 */
export function transformContext(context: EvaluationContext): GoFeatureFlagEvaluationContext {
  const { targetingKey, ...attributes } = context;
  if (targetingKey === undefined || targetingKey === null || targetingKey === '') {
    throw new TargetingKeyMissingError();
  }
  return {
    key: targetingKey,
    custom: attributes,
  };
}

import { EvaluationContext } from '@openfeature/js-sdk';
import { GoFeatureFlagEvaluationContext } from './model';
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

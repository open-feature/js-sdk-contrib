import {
  GoFeatureFlagEvaluationContextFlagListKey,
  GoFeatureFlagEvaluationContextKey,
  type GoFeatureFlagEvaluationContext,
} from './model';
import type { EvaluationContext, EvaluationContextValue } from '@openfeature/web-sdk';
import { TargetingKeyMissingError } from '@openfeature/web-sdk';

/**
 * transformContext takes the raw OpenFeature context returns a GoFeatureFlagEvaluationContext.
 * @param context - the context used for flag evaluation.
 * @returns {GoFeatureFlagEvaluationContext} the user against who we will evaluate the flag.
 */
export function transformContext(context: EvaluationContext, flagList?: string[]): GoFeatureFlagEvaluationContext {
  const { targetingKey, ...attributes } = context;
  if (targetingKey === undefined || targetingKey === null || targetingKey === '') {
    throw new TargetingKeyMissingError();
  }
  if (flagList && flagList.length > 0) {
    attributes[GoFeatureFlagEvaluationContextKey] = {
      [GoFeatureFlagEvaluationContextFlagListKey]: flagList,
    } as EvaluationContextValue;
  }
  return {
    key: targetingKey,
    custom: attributes,
  };
}

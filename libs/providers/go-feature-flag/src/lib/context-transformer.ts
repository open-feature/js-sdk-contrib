import type { EvaluationContext } from '@openfeature/server-sdk';
import { sha1 } from 'object-hash';
import type { GOFFEvaluationContext } from './model';

/**
 * transformContext takes the raw OpenFeature context returns a GoFeatureFlagUser.
 * @param context - the context used for flag evaluation.
 * @returns {GOFFEvaluationContext} the evaluation context against which we will evaluate the flag.
 */
export function transformContext(context: EvaluationContext): GOFFEvaluationContext {
  const { targetingKey, ...attributes } = context;
  const key = targetingKey || sha1(context) || 'anonymous';
  return {
    key: key,
    custom: attributes,
  };
}

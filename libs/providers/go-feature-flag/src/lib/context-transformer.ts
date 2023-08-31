import { EvaluationContext } from '@openfeature/js-sdk';
import { sha1 } from 'object-hash';
import { GoFeatureFlagUser } from './model';

/**
 * transformContext takes the raw OpenFeature context returns a GoFeatureFlagUser.
 * @param context - the context used for flag evaluation.
 * @returns {GoFeatureFlagUser} the user against who we will evaluate the flag.
 */
export function transformContext(context: EvaluationContext): GoFeatureFlagUser {
  const { targetingKey, ...attributes } = context;

  // If we don't have a targetingKey we are using a hash of the object to build
  // a consistent key. If for some reason it fails we are using a constant string
  const key = targetingKey || sha1(context) || 'anonymous';

  // Handle the special case of the anonymous field
  let anonymous = false;
  if (attributes !== undefined && attributes !== null && 'anonymous' in attributes) {
    if (typeof attributes['anonymous'] === 'boolean') {
      anonymous = attributes['anonymous'];
    }
    delete attributes['anonymous'];
  }

  return {
    key,
    anonymous,
    custom: attributes,
  };
}

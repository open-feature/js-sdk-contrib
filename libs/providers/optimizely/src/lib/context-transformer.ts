import type { UserAttributes } from '@optimizely/optimizely-sdk';
import { TargetingKeyMissingError } from '@openfeature/server-sdk';
import type { EvaluationContext, Logger } from '@openfeature/server-sdk';

export type OptimizelyContext = {
  userId: string;
  attributes: UserAttributes;
};

export function transformContext(context: EvaluationContext, logger: Logger): OptimizelyContext {
  const targetingKey = context['targetingKey'];
  if (typeof targetingKey !== 'string' || targetingKey.trim().length === 0) {
    throw new TargetingKeyMissingError('Optimizely evaluations require a non-empty string targetingKey.');
  }

  const attributes: UserAttributes = {};
  for (const [key, value] of Object.entries(context as Record<string, unknown>)) {
    if (key === 'targetingKey') {
      continue;
    }

    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      attributes[key] = value;
      continue;
    }

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      attributes[key] = value.toISOString();
      continue;
    }

    logger.warn(`Ignoring unsupported Optimizely attribute '${key}'.`);
  }

  return { userId: targetingKey, attributes };
}

import MurmurHash3 from 'imurmurhash';
import type { EvaluationContextValue } from '@openfeature/core';
import { flagKeyPropertyKey, flagdPropertyKey, targetingPropertyKey, getLoggerFromContext } from './common';
import type { EvaluationContextWithLogger } from './common';

export const fractionalRule = 'fractional';

type VariantValue = string | number | boolean | null;

export function fractional(data: unknown, context: EvaluationContextWithLogger): VariantValue {
  const logger = getLoggerFromContext(context);
  if (!Array.isArray(data)) {
    return null;
  }

  const args = Array.from(data);
  if (args.length < 1) {
    logger.debug(`Invalid ${fractionalRule} configuration: Expected at least 1 bucket, got ${args.length}`);
    return null;
  }

  const flagdProperties = context[flagdPropertyKey] as { [key: string]: EvaluationContextValue } | undefined;
  if (!flagdProperties) {
    logger.debug('Missing flagd properties, cannot perform fractional targeting');
    return null;
  }

  let bucketBy: string | undefined;
  let buckets: unknown[];

  if (typeof args[0] == 'string') {
    bucketBy = args[0];
    buckets = args.slice(1, args.length);
  } else {
    const targetingKey = context[targetingPropertyKey];
    if (!targetingKey) {
      logger.debug('Missing targetingKey property, cannot perform fractional targeting');
      return null;
    }
    bucketBy = `${flagdProperties[flagKeyPropertyKey]}${targetingKey}`;
    buckets = args;
  }

  let bucketingList;

  try {
    bucketingList = toBucketingList(buckets);
  } catch (err) {
    logger.debug(`Invalid ${fractionalRule} configuration: `, (err as Error).message);
    return null;
  }

  const MAX_WEIGHT = 2147483647;
  if (bucketingList.totalWeight > MAX_WEIGHT) {
    logger.debug(
      `Invalid ${fractionalRule} configuration: sum of weights exceeds Math.MaxInt32 (${MAX_WEIGHT}), got ${bucketingList.totalWeight}`,
    );
    return null;
  }

  const hashUint32 = BigInt(new MurmurHash3(bucketBy).result() >>> 0);
  const bucket = (hashUint32 * BigInt(bucketingList.totalWeight)) >> BigInt(32);

  let sum = BigInt(0);
  for (let i = 0; i < bucketingList.fractions.length; i++) {
    const bucketEntry = bucketingList.fractions[i];

    sum += BigInt(bucketEntry.fraction);

    if (sum > bucket) {
      return bucketEntry.variant;
    }
  }

  return null;
}

function toBucketingList(from: unknown[]): {
  fractions: { variant: VariantValue; fraction: number }[];
  totalWeight: number;
} {
  const bucketingArray: { variant: VariantValue; fraction: number }[] = [];

  let totalWeight = 0;
  for (let i = 0; i < from.length; i++) {
    const entry = from[i];
    if (!Array.isArray(entry)) {
      throw new Error('Invalid bucket entries');
    }

    if (entry.length == 0 || entry.length > 2) {
      throw new Error('Invalid bucketing entry. Requires at least a variant');
    }

    let variant: VariantValue;
    if (typeof entry[0] === 'string' || typeof entry[0] === 'number' || typeof entry[0] === 'boolean') {
      variant = entry[0];
    } else if (entry[0] === null || entry[0] === undefined) {
      variant = null;
    } else {
      throw new Error(
        'Bucketing requires variant to be a string, number, or boolean (or a JSONLogic expression that evaluates to one)',
      );
    }

    let weight = 1;
    if (entry.length >= 2) {
      const raw = entry[1];
      if (typeof raw !== 'number' || !Number.isInteger(raw)) {
        throw new Error('Bucketing requires weight to be an integer');
      }
      weight = Math.max(0, raw);
    }

    bucketingArray.push({ fraction: weight, variant });
    totalWeight += weight;
  }

  return { fractions: bucketingArray, totalWeight };
}

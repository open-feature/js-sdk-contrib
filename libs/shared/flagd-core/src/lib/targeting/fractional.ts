import { EvaluationContext } from '@openfeature/core';
import MurmurHash3 from 'imurmurhash';
import { flagKeyPropertyKey, flagdPropertyKey, targetingPropertyKey } from './common';

export const fractionalRule = 'fractional';

// we put the context at the first index of the arg array in this rule
export function fractional(context: EvaluationContext, ...args: unknown[]): string | null {
  if (typeof context !== 'object') {
    return null;
  }
  if (args.length < 2) {
    console.error('Invalid targeting rule. Require at least two buckets.');
    return null;
  }
  const flagdProperties = context[flagdPropertyKey] as { [flagKeyPropertyKey]: string };
  if (!flagdProperties || !flagdProperties[flagKeyPropertyKey]) {
    return null;
  }

  let bucketBy: string | undefined;
  let buckets: unknown[];

  if (typeof args[0] == 'string') {
    bucketBy = args[0];
    buckets = args.slice(1, args.length);
  } else {
    bucketBy = context[targetingPropertyKey];
    if (!bucketBy) {
      console.error('Missing targetingKey property');
      return null;
    }

    buckets = args;
  }

  let bucketingList;

  try {
    bucketingList = toBucketingList(buckets);
  } catch (e) {
    console.error('Error parsing targeting rule', e);
    return null;
  }

  const hashKey = flagdProperties[flagKeyPropertyKey] + bucketBy;
  // hash in signed 32 format. Bitwise operation here works in signed 32 hence the conversion
  const hash = new MurmurHash3(hashKey).result() | 0;
  const bucket = (Math.abs(hash) / 2147483648) * 100;

  let sum = 0;
  for (let i = 0; i < bucketingList.length; i++) {
    const bucketEntry = bucketingList[i];

    sum += bucketEntry.fraction;

    if (sum >= bucket) {
      return bucketEntry.variant;
    }
  }

  return null;
}

function toBucketingList(from: unknown[]): { variant: string; fraction: number }[] {
  // extract bucketing options
  const bucketingArray: { variant: string; fraction: number }[] = [];

  let bucketSum = 0;
  for (let i = 0; i < from.length; i++) {
    const entry = from[i];
    if (!Array.isArray(entry)) {
      throw new Error('Invalid bucket entries');
    }

    if (entry.length != 2) {
      throw new Error('Invalid bucketing entry. Require two values - variant and percentage');
    }

    if (typeof entry[0] !== 'string') {
      throw new Error('Bucketing require variant to be present in string format');
    }

    if (typeof entry[1] !== 'number') {
      throw new Error('Bucketing require bucketing percentage to be present');
    }

    bucketingArray.push({ fraction: entry[1], variant: entry[0] });
    bucketSum += entry[1];
  }

  if (bucketSum != 100) {
    throw new Error('Bucketing sum must add up to 100');
  }

  return bucketingArray;
}

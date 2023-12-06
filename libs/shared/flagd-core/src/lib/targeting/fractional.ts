import MurmurHash3 from 'imurmurhash';
import { flagKeyPropertyKey, flagdPropertyKey, targetingPropertyKey } from './common';

export const fractionalRule = 'fractional';

export function fractional(...args: unknown[]): string | null {
  if (args.length < 2) {
    console.error('Invalid targeting rule. Require at least two buckets.');
    return null;
  }

  // we put the context at the first index of the array
  const context: {[key: string]: any} | undefined = args[0] || undefined;
  if (typeof context !== 'object') {
    return null;
  }
  const logicArgs = args.slice(1);
  const flagdProperties = context[flagdPropertyKey];
  if (!flagdProperties) {
    return null;
  }

  let bucketBy: string;
  let buckets: unknown[];

  if (typeof logicArgs[0] == 'string') {
    bucketBy = logicArgs[0];
    buckets = logicArgs.slice(1, logicArgs.length);
  } else {
    bucketBy = context[targetingPropertyKey];
    if (!bucketBy) {
      console.error('Missing targetingKey property');
      return null;
    }

    buckets = logicArgs;
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

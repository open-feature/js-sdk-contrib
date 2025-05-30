import type { FlagMetadata } from '@openfeature/core';

export const TEST_FLAG_METADATA: FlagMetadata = {
  booleanKey: true,
  stringKey: 'string',
  numberKey: 1,
} as const;

export const TEST_FLAG_SET_METADATA: FlagMetadata = {
  flagSetBooleanKey: true,
  flagSetStringKey: 'string',
  flagSetNumberKey: 1,
} as const;

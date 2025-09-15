import type { FlagValue, JsonValue } from '@openfeature/server-sdk';

export type FlagType = 'string' | 'number' | 'object' | 'boolean';

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = parseFloat(value as string);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 0) return false;
    if (value === 1) return true;
    return undefined;
  }
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }
  return undefined;
};

const toObject = (value: unknown): JsonValue | undefined => {
  if (typeof value === 'object') return value as JsonValue;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (error) {
      return undefined;
    }
  }
  return undefined;
};

/**
 * Return a value of the specified type based on the type parameter.
 *
 * @param value - The value to be converted or validated.
 * @param type - The target type for the conversion.
 * @returns The converted value if successful, or null if conversion fails or the type is unsupported.
 */
export const typeFactory = (
  value: string | number | boolean | null | undefined,
  type: FlagType,
): FlagValue | undefined => {
  if (value === null || value === undefined) return undefined;
  switch (type) {
    case 'string':
      return value !== null && typeof value !== 'undefined' ? String(value) : undefined;
    case 'number':
      return toNumber(value);
    case 'boolean':
      return toBoolean(value);
    case 'object':
      return toObject(value);
    default:
      return undefined;
  }
};

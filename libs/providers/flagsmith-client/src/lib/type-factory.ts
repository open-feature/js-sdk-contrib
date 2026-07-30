import type { FlagValue } from '@openfeature/web-sdk';

export type FlagType = 'string' | 'number' | 'object' | 'boolean';

/**
 * Ret a value of the specified type based on the type parameter.
 *
 * @param value - The value to be converted or validated.
 * @param type - The target type for the conversion.
 * @returns The converted value if successful, or null if conversion fails or the type is unsupported.
 */
export const typeFactory = (
  value: string | number | boolean | null | undefined,
  type: FlagType,
): FlagValue | undefined => {
  if (value === null) return undefined;
  switch (type) {
    case 'string':
      return value !== null && typeof value !== 'undefined' ? `${value}` : value;
    case 'number': {
      if (typeof value === 'number') return value;
      if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) return parsed;
      }
      return value;
    }
    case 'boolean':
      return value;
    case 'object':
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch (error) {
          return value;
        }
      }
      return value;
    default:
      return value;
  }
};

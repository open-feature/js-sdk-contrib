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
    case 'number':
      return typeof value === 'number' ? value : parseFloat(value as string) || value;
    case 'boolean':
      return typeof value === 'boolean' ? value : false;
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

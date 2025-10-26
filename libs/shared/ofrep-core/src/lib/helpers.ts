/**
 * Checks whether the parameter is not undefined.
 * @param {unknown} value The value to check
 * @returns {value is string} True if the value is a string
 */
export function isDefined<T>(value: T | undefined | null): value is T {
  return typeof value !== 'undefined';
}

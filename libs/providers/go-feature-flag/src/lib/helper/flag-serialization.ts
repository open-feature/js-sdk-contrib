import type { Flag } from '../model';

/**
 * Produces a per-flag serialization that changes whenever that flag's configuration changes.
 *
 * Each flag is deliberately treated as opaque: it is serialized whole rather than inspected, so a
 * flag gaining a field the provider knows nothing about still counts as a change.
 * @param flags - the flag configurations returned by the relay proxy
 * @returns a serialization per flag key, in a null-prototype record
 */
export function serializeFlags(flags: Record<string, Flag>): Record<string, string> {
  // Null-prototype: a flag key is arbitrary user input, and assigning `__proto__` on a plain object
  // literal is silently discarded, which would drop that flag from the comparison entirely.
  const serializations: Record<string, string> = Object.create(null);
  for (const [flagKey, flag] of Object.entries(flags)) {
    serializations[flagKey] = JSON.stringify(flag);
  }
  return serializations;
}

/**
 * Lists the flag keys that were added, removed, or whose configuration changed.
 * @param previous - serializations of the configuration being served
 * @param next - serializations of the configuration just retrieved
 * @returns the keys that differ between the two
 */
export function diffFlagSerializations(previous: Record<string, string>, next: Record<string, string>): string[] {
  const changed = new Set<string>();
  // Membership is decided on own keys only, on both sides: `'toString' in next` is true for any
  // plain object, so a flag named after an Object.prototype member would otherwise never be
  // reported as removed, and would be compared against the inherited member rather than absent.
  const previousKeys = new Set(Object.keys(previous));
  const nextKeys = new Set(Object.keys(next));
  for (const [flagKey, serialization] of Object.entries(next)) {
    if (!previousKeys.has(flagKey) || previous[flagKey] !== serialization) {
      changed.add(flagKey);
    }
  }
  for (const flagKey of previousKeys) {
    if (!nextKeys.has(flagKey)) {
      changed.add(flagKey);
    }
  }
  return [...changed];
}

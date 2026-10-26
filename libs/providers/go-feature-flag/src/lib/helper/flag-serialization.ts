import type { Flag } from '../model';

/**
 * Copies a flag map into a null-prototype object so it is safe to look up by an arbitrary key.
 *
 * A flag map is decoded with JSON.parse and therefore inherits from Object.prototype, so looking up
 * a flag named after one of its members - `toString`, `constructor`, `valueOf` - returns the
 * inherited member instead of undefined. The caller then treats a flag that does not exist as
 * present and hands it to the evaluation engine, rather than reporting FLAG_NOT_FOUND.
 *
 * A flag genuinely named `__proto__` survives: on a null-prototype target there is no setter to
 * intercept the assignment, so it is copied as an ordinary own property.
 * @param flags - the flag configurations returned by the relay proxy
 * @returns the same flags in an object with no prototype
 */
export function toFlagLookup(flags: Record<string, Flag>): Record<string, Flag> {
  return Object.assign(Object.create(null), flags);
}

/**
 * Produces a per-flag serialization that changes whenever that flag's configuration changes.
 *
 * Each flag is deliberately treated as opaque: it is serialized whole rather than inspected, so a
 * flag gaining a field the provider knows nothing about still counts as a change.
 *
 * `JSON.stringify` preserves property order, so two renderings of the same flag that differ only
 * in the order of their keys compare as a change. That holds today because the relay proxy sorts
 * map keys and emits struct fields in declaration order, but that guarantee lives in the producer
 * rather than here: a different producer, or an intermediary that reorders, would show up as
 * spurious ConfigurationChanged events rather than as a bug in this file.
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

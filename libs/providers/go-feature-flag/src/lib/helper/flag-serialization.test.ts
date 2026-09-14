import type { Flag } from '../model';
import { diffFlagSerializations, serializeFlags } from './flag-serialization';

/**
 * Builds a flag configuration, letting each test override only what it cares about.
 * @param overrides - the fields to change from the baseline flag
 * @returns a flag configuration
 */
function aFlag(overrides: Partial<Flag> = {}): Flag {
  return {
    variations: { enabled: true, disabled: false },
    defaultRule: { variation: 'disabled' },
    ...overrides,
  };
}

describe('serializeFlags', () => {
  it('should return an empty record for an empty configuration', () => {
    expect(serializeFlags({})).toEqual({});
  });

  it('should produce one serialization per flag key', () => {
    const serializations = serializeFlags({ flagA: aFlag(), flagB: aFlag() });

    expect(Object.keys(serializations).sort()).toEqual(['flagA', 'flagB']);
  });

  it('should produce the same serialization for the same configuration', () => {
    expect(serializeFlags({ flagA: aFlag() })).toEqual(serializeFlags({ flagA: aFlag() }));
  });

  it('should produce a different serialization when a known field changes', () => {
    const before = serializeFlags({ flagA: aFlag({ defaultRule: { variation: 'disabled' } }) });
    const after = serializeFlags({ flagA: aFlag({ defaultRule: { variation: 'enabled' } }) });

    expect(after['flagA']).not.toEqual(before['flagA']);
  });

  it('should produce a different serialization when a field the provider does not know about changes', () => {
    const before = serializeFlags({ flagA: { ...aFlag(), unknownField: 'before' } as Flag });
    const after = serializeFlags({ flagA: { ...aFlag(), unknownField: 'after' } as Flag });

    expect(after['flagA']).not.toEqual(before['flagA']);
  });

  it('should serialize a flag named after an Object.prototype member', () => {
    // Computed keys, so that `__proto__` is an own property of the input rather than its prototype.
    const serializations = serializeFlags({ ['__proto__']: aFlag(), ['toString']: aFlag() });

    expect(Object.keys(serializations).sort()).toEqual(['__proto__', 'toString']);
  });

  it('should not be affected by the order of the top-level flag keys', () => {
    const flagA = aFlag({ version: '1.0' });
    const flagB = aFlag({ version: '2.0' });

    expect(serializeFlags({ flagA, flagB })).toEqual(serializeFlags({ flagB, flagA }));
  });

  it('should treat a flag whose own fields are reordered as a different serialization', () => {
    // Known limitation: flags are compared as raw JSON text, so a relay proxy that emits a flag's
    // fields in a different order reports that flag as changed. Harmless (it over-reports, never
    // under-reports) and stable in practice, since JSON.parse preserves the order it received.
    const before = serializeFlags({ flagA: { defaultRule: { variation: 'a' }, disable: false } as Flag });
    const after = serializeFlags({ flagA: { disable: false, defaultRule: { variation: 'a' } } as Flag });

    expect(after['flagA']).not.toEqual(before['flagA']);
  });
});

describe('diffFlagSerializations', () => {
  it('should report no change between two empty configurations', () => {
    expect(diffFlagSerializations({}, {})).toEqual([]);
  });

  it('should report no change when both configurations are identical', () => {
    const serializations = serializeFlags({ flagA: aFlag(), flagB: aFlag() });

    expect(diffFlagSerializations(serializations, serializations)).toEqual([]);
  });

  it('should report a flag whose configuration changed', () => {
    const previous = serializeFlags({ flagA: aFlag({ version: '1.0' }), flagB: aFlag() });
    const next = serializeFlags({ flagA: aFlag({ version: '2.0' }), flagB: aFlag() });

    expect(diffFlagSerializations(previous, next)).toEqual(['flagA']);
  });

  it('should report an added flag', () => {
    const previous = serializeFlags({ flagA: aFlag() });
    const next = serializeFlags({ flagA: aFlag(), flagB: aFlag() });

    expect(diffFlagSerializations(previous, next)).toEqual(['flagB']);
  });

  it('should report a removed flag', () => {
    const previous = serializeFlags({ flagA: aFlag(), flagB: aFlag() });
    const next = serializeFlags({ flagA: aFlag() });

    expect(diffFlagSerializations(previous, next)).toEqual(['flagB']);
  });

  it('should report every flag when the whole configuration is replaced', () => {
    const previous = serializeFlags({ flagA: aFlag(), flagB: aFlag() });
    const next = serializeFlags({ flagC: aFlag(), flagD: aFlag() });

    expect(diffFlagSerializations(previous, next).sort()).toEqual(['flagA', 'flagB', 'flagC', 'flagD']);
  });

  it('should report every flag of the new configuration when the previous one was empty', () => {
    const next = serializeFlags({ flagA: aFlag(), flagB: aFlag() });

    expect(diffFlagSerializations({}, next).sort()).toEqual(['flagA', 'flagB']);
  });

  it('should report every flag of the previous configuration when the new one is empty', () => {
    const previous = serializeFlags({ flagA: aFlag(), flagB: aFlag() });

    expect(diffFlagSerializations(previous, {}).sort()).toEqual(['flagA', 'flagB']);
  });

  it('should report each changed flag only once', () => {
    const previous = serializeFlags({ flagA: aFlag({ version: '1.0' }) });
    const next = serializeFlags({ flagA: aFlag({ version: '2.0' }) });

    expect(diffFlagSerializations(previous, next)).toEqual(['flagA']);
  });

  it('should report a mix of added, removed and changed flags', () => {
    const previous = serializeFlags({
      unchanged: aFlag(),
      changed: aFlag({ version: '1.0' }),
      removed: aFlag(),
    });
    const next = serializeFlags({
      unchanged: aFlag(),
      changed: aFlag({ version: '2.0' }),
      added: aFlag(),
    });

    expect(diffFlagSerializations(previous, next).sort()).toEqual(['added', 'changed', 'removed']);
  });

  it('should not report an unchanged flag named after an Object.prototype member', () => {
    const serializations = serializeFlags({ constructor: aFlag(), toString: aFlag() });

    expect(diffFlagSerializations(serializations, serializations)).toEqual([]);
  });

  it('should report a removed flag named after an Object.prototype member', () => {
    // `'toString' in next` is true for any plain object, so membership cannot be tested with `in`.
    const previous = serializeFlags({ flagA: aFlag(), toString: aFlag() });
    const next = serializeFlags({ flagA: aFlag() });

    expect(diffFlagSerializations(previous, next)).toEqual(['toString']);
  });

  it('should report an added flag named after an Object.prototype member', () => {
    const previous = serializeFlags({ flagA: aFlag() });
    const next = serializeFlags({ flagA: aFlag(), toString: aFlag() });

    expect(diffFlagSerializations(previous, next)).toEqual(['toString']);
  });
});

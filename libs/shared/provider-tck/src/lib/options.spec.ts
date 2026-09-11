import { ALL_CAPABILITIES, Capability, DECLARABLE_CAPABILITIES, RESERVED_CAPABILITIES } from './capability';
import type { BackendControl } from './control';
import type { TckOptions } from './options';
import { resolveCapabilities } from './options';

const control: BackendControl = {
  description: 'a control that exists only to be named in a report',
  prepareScenario: async () => undefined,
  changeFlag: async () => undefined,
};

const optionsFor = (overrides: Partial<TckOptions> = {}): TckOptions => ({
  name: 'unit',
  control,
  newProvider: () => {
    throw new Error('no provider is constructed while resolving options');
  },
  ...overrides,
});

describe('the reserved capabilities', () => {
  it('are the ones no scenario carries, and are not declarable', () => {
    // The list lives in one place so it cannot drift from the rule. That it matches the feature
    // files is checked by the harness on every run, against what actually ran.
    expect(RESERVED_CAPABILITIES).toEqual([Capability.Targeting, Capability.Caching]);
    expect(DECLARABLE_CAPABILITIES).not.toContain(Capability.Targeting);
    expect(DECLARABLE_CAPABILITIES).not.toContain(Capability.Caching);
    expect(DECLARABLE_CAPABILITIES.length).toBe(ALL_CAPABILITIES.length - RESERVED_CAPABILITIES.length);
  });

  it('are still recognised as tags, because a tag has to be recognised to be refused', () => {
    for (const capability of RESERVED_CAPABILITIES) {
      expect(ALL_CAPABILITIES).toContain(capability);
    }
  });
});

describe('resolving a suite capabilities', () => {
  it('declares every declarable capability by default, and no reserved one', () => {
    // "Declare everything" is the recommended starting point for a new adoption, and it must not
    // mean "declare things nothing tested" -- which is exactly how a real Java report came to
    // assert @targeting and @caching.
    const { declared } = resolveCapabilities(optionsFor({ newUnavailableProvider: () => ({}) as never }));

    expect([...declared].sort()).toEqual([...DECLARABLE_CAPABILITIES].sort());
    for (const capability of RESERVED_CAPABILITIES) {
      expect(declared.has(capability)).toBe(false);
    }
  });

  it('leaves an inapplicable capability out of the default, without restating the whole set', () => {
    const { declared, notApplicable } = resolveCapabilities(
      optionsFor({
        newUnavailableProvider: () => ({}) as never,
        notApplicable: { [Capability.NumericCoercion]: 'no integer type' },
      }),
    );

    expect(declared.has(Capability.NumericCoercion)).toBe(false);
    expect(declared.has(Capability.Events)).toBe(true);
    expect(notApplicable.get(Capability.NumericCoercion)).toBe('no integer type');
  });

  it('refuses a suite that declares a reserved capability', () => {
    // Refused rather than dropped: a suite that asked for a claim it cannot have should be told,
    // not quietly corrected into a report that no longer matches what it wrote.
    expect(() => resolveCapabilities(optionsFor({ capabilities: [Capability.Events, Capability.Targeting] }))).toThrow(
      /@targeting, which no scenario carries/,
    );
  });

  it('refuses a reserved capability declared inapplicable, which is a claim about nothing', () => {
    expect(() =>
      resolveCapabilities(optionsFor({ capabilities: [], notApplicable: { [Capability.Caching]: 'no cache' } })),
    ).toThrow(/@caching, which no scenario carries/);
  });

  it('reports every reserved capability a suite named, rather than only the first', () => {
    expect(() => resolveCapabilities(optionsFor({ capabilities: [Capability.Targeting, Capability.Caching] }))).toThrow(
      /@targeting @caching/,
    );
  });

  it('gates on the declarable capabilities a suite left out', () => {
    const { undeclared } = resolveCapabilities(optionsFor({ capabilities: [Capability.Events] }));

    // A reserved capability is absent from the gate, and its absence gates nothing: no scenario
    // carries it, so there is nothing for 'not @targeting' to exclude.
    expect(undeclared).not.toContain(Capability.Events);
    expect(undeclared).not.toContain(Capability.Targeting);
    expect(undeclared).toContain(Capability.Stale);
    expect(undeclared.length).toBe(DECLARABLE_CAPABILITIES.length - 1);
  });

  it('refuses a capability that is both declared and inapplicable', () => {
    expect(() =>
      resolveCapabilities(
        optionsFor({
          capabilities: [Capability.NumericCoercion],
          notApplicable: { [Capability.NumericCoercion]: 'no integer type' },
        }),
      ),
    ).toThrow(/both list @numeric-coercion/);
  });

  it('refuses @unavailable without a provider pointed at a backend that does not exist', () => {
    expect(() => resolveCapabilities(optionsFor({ capabilities: [Capability.UnavailableInit] }))).toThrow(
      /newUnavailableProvider is not set/,
    );
  });
});

import {
  ALL_CAPABILITIES,
  Capability,
  DECLARABLE_CAPABILITIES,
  RESERVED_CAPABILITIES,
  capabilityForTag,
  isReserved,
} from './capability';
import type { BackendControl } from './control';
import { KnownDeviation } from './deviation';
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
    expect(RESERVED_CAPABILITIES).toEqual([Capability.Caching]);
    expect(DECLARABLE_CAPABILITIES).not.toContain(Capability.Caching);
    expect(DECLARABLE_CAPABILITIES.length).toBe(ALL_CAPABILITIES.length - RESERVED_CAPABILITIES.length);
  });

  it('are still recognised as tags, because a tag has to be recognised to be refused', () => {
    for (const capability of RESERVED_CAPABILITIES) {
      expect(ALL_CAPABILITIES).toContain(capability);
    }
  });

  it('word the refusal as English with a single name left, a reservation having expired', () => {
    // @caching is the only reservation left, so the list the message quotes has one entry. It used
    // to read "@caching are reserved names". A reservation expiring is the expected course of
    // events rather than a surprise, so the message has to survive the next one too.
    expect(() => resolveCapabilities(optionsFor({ capabilities: [Capability.Caching] }))).toThrow(
      /@caching is a reserved name held open/,
    );
  });
});

describe('the @targeting capability', () => {
  // It was reserved, on the reading that targeting is backend evaluation logic and so out of scope.
  // Appendix F now carries three scenarios for it, because targeting-key-flag is what makes context
  // passthrough observable at all: every other flag resolves the same way whatever the context, so a
  // provider that drops it passes them all. The rule is stated as behaviour rather than as syntax,
  // so what is under test is still the provider and not the backend's rule language.
  it('is declarable, the scenarios it was held open for now existing', () => {
    expect(RESERVED_CAPABILITIES).not.toContain(Capability.Targeting);
    expect(isReserved(Capability.Targeting)).toBe(false);
    expect(DECLARABLE_CAPABILITIES).toContain(Capability.Targeting);
  });

  it('resolves from the tag the gated scenarios carry', () => {
    expect(capabilityForTag('@targeting')).toBe(Capability.Targeting);
  });

  it('is accepted where naming it used to be refused', () => {
    const { declared } = resolveCapabilities(optionsFor({ capabilities: [Capability.Events, Capability.Targeting] }));

    expect(declared.has(Capability.Targeting)).toBe(true);
  });

  it('carries a known deviation, now that there is a scenario to deviate from', () => {
    // The mirror of the reserved rule. While it was reserved a deviation against it was refused,
    // there being no scenario for the gap to be against; with three scenarios there is.
    const { knownDeviations } = resolveCapabilities(
      optionsFor({
        capabilities: [Capability.Targeting],
        knownDeviations: [KnownDeviation.untracked(Capability.Targeting, 'the context is dropped below the transport')],
      }),
    );

    expect(knownDeviations).toHaveLength(1);
    expect(knownDeviations[0].capability).toBe(Capability.Targeting);
  });
});

describe('the @variants capability', () => {
  // Requirement 2.2.4 is a SHOULD and types.md types the field `variant (string, optional)`, so a
  // backend with no variant concept for a plain flag is not defective. Asserting a variant in every
  // evaluation scenario failed such a provider ten times over for something no author could fix,
  // and with no capability to hang it on there was nothing to record as a deviation either.
  it('is declarable, a variant being optional in both places that say so', () => {
    expect(DECLARABLE_CAPABILITIES).toContain(Capability.Variants);
    expect(isReserved(Capability.Variants)).toBe(false);
  });

  it('resolves from the tag the gated outline carries', () => {
    expect(capabilityForTag('@variants')).toBe(Capability.Variants);
  });

  it('is left out when a suite narrows the default, without needing a deviation', () => {
    const { declared, undeclared, knownDeviations } = resolveCapabilities(
      optionsFor({ capabilities: [Capability.Events] }),
    );

    expect(declared.has(Capability.Variants)).toBe(false);
    expect(undeclared).toContain(Capability.Variants);
    expect(knownDeviations).toEqual([]);
  });
});

describe('the @reinitialization capability', () => {
  // Requirement 2.5.2 says a provider SHOULD revert to its uninitialized state after shutdown, and
  // that "some providers MAY allow reinitialization from this state". Permitted, not required — so
  // the reuse scenario has to be gated, and the gate has to be declarable. A provider that declines
  // reuse leaves it undeclared and the scenario skips; the wrong move is to declare it and record a
  // deviation, which reports a sanctioned choice as a defect.
  it('is declarable, because declining reuse is a choice and offering it is a claim', () => {
    expect(DECLARABLE_CAPABILITIES).toContain(Capability.Reinitialization);
    expect(isReserved(Capability.Reinitialization)).toBe(false);
  });

  it('resolves from the tag the gated scenario carries', () => {
    expect(capabilityForTag('@reinitialization')).toBe(Capability.Reinitialization);
  });

  it('is left out when a suite narrows the default, without needing a deviation', () => {
    const { declared, undeclared, knownDeviations } = resolveCapabilities(
      optionsFor({ capabilities: [Capability.Lifecycle] }),
    );

    expect(declared.has(Capability.Lifecycle)).toBe(true);
    expect(declared.has(Capability.Reinitialization)).toBe(false);
    expect(undeclared).toContain(Capability.Reinitialization);
    expect(knownDeviations).toEqual([]);
  });
});

describe('resolving a suite capabilities', () => {
  it('declares every declarable capability by default, and no reserved one', () => {
    // "Declare everything" is the recommended starting point for a new adoption, and it must not
    // mean "declare things nothing tested" -- which is exactly how a real Java report came to
    // assert @targeting and @caching, back when both were reserved.
    const { declared } = resolveCapabilities(optionsFor({ newUnavailableProvider: () => ({}) as never }));

    expect([...declared].sort()).toEqual([...DECLARABLE_CAPABILITIES].sort());
    for (const capability of RESERVED_CAPABILITIES) {
      expect(declared.has(capability)).toBe(false);
    }
  });

  it('refuses a suite that declares a reserved capability', () => {
    // Refused rather than dropped: a suite that asked for a claim it cannot have should be told,
    // not quietly corrected into a report that no longer matches what it wrote.
    expect(() => resolveCapabilities(optionsFor({ capabilities: [Capability.Events, Capability.Caching] }))).toThrow(
      /@caching, which no scenario carries/,
    );
  });

  it('names the reserved capability the suite asked for, deduplicated', () => {
    // The message lists what the suite named rather than stopping at the first offender. There is
    // only one reserved name left to offend with, so a repeat is the case left to pin: a suite that
    // named it twice must not be told about it twice.
    expect(() =>
      resolveCapabilities(optionsFor({ capabilities: [Capability.Caching, Capability.Caching] })),
    ).toThrow(/capabilities names @caching, which no scenario carries/);
  });

  it('gates on the declarable capabilities a suite left out', () => {
    const { undeclared } = resolveCapabilities(optionsFor({ capabilities: [Capability.Events] }));

    // A reserved capability is absent from the gate, and its absence gates nothing: no scenario
    // carries it, so there is nothing for 'not @caching' to exclude. @targeting is no longer in that
    // position -- it has scenarios, so leaving it out genuinely gates them.
    expect(undeclared).not.toContain(Capability.Events);
    expect(undeclared).not.toContain(Capability.Caching);
    expect(undeclared).toContain(Capability.Targeting);
    expect(undeclared).toContain(Capability.Stale);
    expect(undeclared.length).toBe(DECLARABLE_CAPABILITIES.length - 1);
  });

  it('refuses @unavailable without a provider pointed at a backend that does not exist', () => {
    expect(() => resolveCapabilities(optionsFor({ capabilities: [Capability.UnavailableInit] }))).toThrow(
      /newUnavailableProvider is not set/,
    );
  });
});

describe('a known deviation', () => {
  it('records the capability, the issue and the summary a tracked gap has', () => {
    const deviation = KnownDeviation.tracked(
      Capability.Stale,
      'https://github.com/open-feature/js-sdk-contrib/issues/1',
      'never leaves STALE',
    );

    expect(deviation).toEqual({
      capability: Capability.Stale,
      issue: 'https://github.com/open-feature/js-sdk-contrib/issues/1',
      summary: 'never leaves STALE',
    });
  });

  it('leaves the issue absent on an untracked gap rather than inventing one', () => {
    // Absent rather than empty: a consumer asking "is this tracked?" must not have to decide
    // whether '' counts, and a report that serialises the field has nothing to omit either.
    const deviation = KnownDeviation.untracked(Capability.Lifecycle, 'shutdown does not clear the latch');

    expect(deviation.issue).toBeUndefined();
    expect('issue' in deviation).toBe(false);
    expect(deviation).toEqual({ capability: Capability.Lifecycle, summary: 'shutdown does not clear the latch' });
  });

  it('records a gap against a mandatory scenario, which belongs to no capability', () => {
    const deviation = KnownDeviation.untracked(undefined, 'resolves missing-flag as a default rather than an error');

    expect('capability' in deviation).toBe(false);
    expect(deviation.summary).toMatch(/missing-flag/);
  });

  it('rides alongside the capability it concerns, rather than replacing the declaration', () => {
    // The point of the type: withdrawing @lifecycle would replace a failing scenario with a skip
    // and make a defect look deliberate. Declaring both leaves the scenario running.
    const { declared, knownDeviations } = resolveCapabilities(
      optionsFor({
        capabilities: [Capability.Lifecycle],
        knownDeviations: [KnownDeviation.untracked(Capability.Lifecycle, 'shutdown does not clear the latch')],
      }),
    );

    expect(declared.has(Capability.Lifecycle)).toBe(true);
    expect(knownDeviations).toHaveLength(1);
    expect(knownDeviations[0].capability).toBe(Capability.Lifecycle);
  });

  it('is empty, not undefined, when a suite declares none', () => {
    expect(resolveCapabilities(optionsFor({ capabilities: [] })).knownDeviations).toEqual([]);
  });

  it('refuses a reserved capability, which leaves nothing to deviate from', () => {
    expect(() =>
      resolveCapabilities(
        optionsFor({ knownDeviations: [KnownDeviation.untracked(Capability.Caching, 'no cache at all')] }),
      ),
    ).toThrow(/@caching, which no scenario carries/);
  });

  it('refuses a deviation with no summary, which says nothing an omission does not', () => {
    expect(() =>
      resolveCapabilities(optionsFor({ knownDeviations: [KnownDeviation.untracked(Capability.Stale, '   ')] })),
    ).toThrow(/with no summary/);
  });
});

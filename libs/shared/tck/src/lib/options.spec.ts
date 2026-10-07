import {
  ALL_CAPABILITIES,
  Capability,
  DECLARABLE_CAPABILITIES,
  INEXPRESSIBLE_CAPABILITIES,
  RESERVED_CAPABILITIES,
  capabilityForTag,
  expiredReservations,
  inexpressibleReason,
  isInexpressible,
  isReserved,
  unknownCapabilityTags,
} from './capability';
import type { BackendControl } from './control';
import { KnownDeviation } from './deviation';
import type { TckOptions } from './options';
import { resolveCapabilities } from './options';

const control: BackendControl = {
  description: 'a control that exists only to be named in a report',
  controlApi: 'in-process',
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
    expect(RESERVED_CAPABILITIES).toEqual([Capability.Caching]);
    expect(DECLARABLE_CAPABILITIES).not.toContain(Capability.Caching);
    expect(DECLARABLE_CAPABILITIES.length).toBe(
      ALL_CAPABILITIES.length - RESERVED_CAPABILITIES.length - Object.keys(INEXPRESSIBLE_CAPABILITIES).length,
    );
  });

  it('are still recognised as tags, because a tag has to be recognised to be refused', () => {
    for (const capability of RESERVED_CAPABILITIES) {
      expect(ALL_CAPABILITIES).toContain(capability);
    }
  });

  it('word the refusal as English with a single name left, a reservation having expired', () => {
    // One entry left, so the message has to read as English with a single name -- and has to go on
    // doing so as further reservations expire.
    expect(() => resolveCapabilities(optionsFor({ capabilities: [Capability.Caching] }))).toThrow(
      /@caching is a reserved name held open/,
    );
  });

  it('expire when a scenario carries one, which the harness checks against what actually ran', () => {
    // An out-of-date list makes a testable capability unclaimable, so the harness fails a run whose
    // canonical features carry a tag this library still calls reserved.
    expect(expiredReservations(['@events', '@object'])).toEqual([]);
    expect(expiredReservations([Capability.Caching, '@events'])).toEqual([Capability.Caching]);

    // Deduplicated: the tags come from every scenario of every executed feature.
    expect(expiredReservations([Capability.Caching, Capability.Caching])).toEqual([Capability.Caching]);
  });
});

describe('a canonical tag this vocabulary does not know', () => {
  // An unknown tag gates nothing, so its scenarios stay mandatory for every adopter -- see
  // `unknownCapabilityTags` for the measurement behind the check.
  it('is detected, because an unknown tag gates nothing and so stays mandatory', () => {
    expect(unknownCapabilityTags(['@events', '@object'])).toEqual([]);
    expect(unknownCapabilityTags(['@events', '@not-a-capability'])).toEqual(['@not-a-capability']);
  });

  it('includes reserved and inexpressible tags in what it considers known', () => {
    // An inexpressible tag has to be recognised precisely so its scenarios can be skipped with
    // their reason, so calling either unknown would fail every run in this package.
    expect(unknownCapabilityTags([...RESERVED_CAPABILITIES, ...Object.keys(INEXPRESSIBLE_CAPABILITIES)])).toEqual([]);
    expect(unknownCapabilityTags(ALL_CAPABILITIES)).toEqual([]);
  });

  it('reports every offending tag once, sorted, rather than the first one found', () => {
    // The tags arrive from every scenario of every executed feature, so a tag carried by four rows
    // is one problem. Sorted so the message is stable.
    expect(unknownCapabilityTags(['@zeta', '@alpha', '@zeta'])).toEqual(['@alpha', '@zeta']);
  });

  it('knows @fully-typed-values, the capability that motivated the check', () => {
    expect(unknownCapabilityTags([Capability.FullyTypedValues])).toEqual([]);
    expect(capabilityForTag('@fully-typed-values')).toBe(Capability.FullyTypedValues);
    expect(DECLARABLE_CAPABILITIES).toContain(Capability.FullyTypedValues);
    expect(isReserved(Capability.FullyTypedValues)).toBe(false);
    expect(isInexpressible(Capability.FullyTypedValues)).toBe(false);
  });
});

describe('the capabilities this SDK cannot express', () => {
  it('is @numeric-coercion and nothing else, the language having one numeric type', () => {
    expect(Object.keys(INEXPRESSIBLE_CAPABILITIES)).toEqual([Capability.NumericCoercion]);
    expect(isInexpressible(Capability.NumericCoercion)).toBe(true);
    expect(DECLARABLE_CAPABILITIES).not.toContain(Capability.NumericCoercion);
  });

  it('is a different thing from a reservation, and neither predicate answers for the other', () => {
    // A reservation is global and expires; this is one language's and permanent. Collapsing the two
    // into one "not declarable" predicate is the shortcut to forbid.
    expect(isReserved(Capability.NumericCoercion)).toBe(false);
    expect(isInexpressible(Capability.Caching)).toBe(false);
    expect(ALL_CAPABILITIES).toContain(Capability.NumericCoercion);
  });

  it('refuses a suite that declares one, naming the SDK property rather than the rule', () => {
    // The error is the point: an adopter should not have to know this about their language.
    expect(() =>
      resolveCapabilities(optionsFor({ capabilities: [Capability.Events, Capability.NumericCoercion] })),
    ).toThrow(/@numeric-coercion, which no provider written against this SDK can be asked about/);
    expect(() => resolveCapabilities(optionsFor({ capabilities: [Capability.NumericCoercion] }))).toThrow(
      /JavaScript has a single numeric type/,
    );
  });

  it('keeps the two refusals distinguishable, because only one of them ever expires', () => {
    // One wording for both would send an adopter looking upstream for a gap that is not there, or
    // waiting for a reservation that will never expire.
    const inexpressible = () => resolveCapabilities(optionsFor({ capabilities: [Capability.NumericCoercion] }));
    const reserved = () => resolveCapabilities(optionsFor({ capabilities: [Capability.Caching] }));

    expect(inexpressible).toThrow(/will not expire/);
    expect(inexpressible).not.toThrow(/reserved/);
    expect(reserved).toThrow(/reserved name held open/);
    expect(reserved).not.toThrow(/SDK/);
  });

  it('gates its scenarios in every run, which is what the per-suite omissions used to do', () => {
    // The half that makes the refusal safe: it can never be in `declared`, so it is always gated,
    // whether a suite narrows the default set or takes it whole.
    const narrowed = resolveCapabilities(optionsFor({ capabilities: [Capability.Events] }));
    const whole = resolveCapabilities(optionsFor({ newUnavailableProvider: () => ({}) as never }));

    expect(narrowed.declared.has(Capability.NumericCoercion)).toBe(false);
    expect(narrowed.undeclared).toContain(Capability.NumericCoercion);
    expect(whole.declared.has(Capability.NumericCoercion)).toBe(false);
    expect(whole.undeclared).toContain(Capability.NumericCoercion);
  });

  it('refuses a deviation against one, which would assert a defect that cannot exist', () => {
    // Unlike the reserved case there *are* scenarios, but none was put to this provider, so an
    // entry would report a language property as this provider's defect.
    expect(() =>
      resolveCapabilities(
        optionsFor({
          knownDeviations: [KnownDeviation.untracked(Capability.NumericCoercion, 'narrows 0.5 to 0')],
        }),
      ),
    ).toThrow(/which this SDK cannot ask of any provider/);
  });

  it('states the reason once, so the refusal and the skip cannot word it differently', () => {
    // Quoted verbatim in the configuration-time error and in every skipped scenario's name -- see
    // scenarioRunner.spec.ts, which asserts the same string.
    const reason = inexpressibleReason(Capability.NumericCoercion);

    expect(reason).toBe(INEXPRESSIBLE_CAPABILITIES[Capability.NumericCoercion]);
    expect(reason).toMatch(/single numeric type/);
    expect(inexpressibleReason(Capability.StandardReasons)).toBeUndefined();
  });
});

describe('the @targeting capability', () => {
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
    // The mirror of the reserved rule: a deviation needs a scenario for the gap to be against.
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

describe('the @standard-reasons capability', () => {
  it('is declarable, a standard reason being a claim rather than a requirement', () => {
    expect(DECLARABLE_CAPABILITIES).toContain(Capability.StandardReasons);
    expect(isReserved(Capability.StandardReasons)).toBe(false);
  });

  it('resolves from the tag reason.feature carries at feature level', () => {
    expect(capabilityForTag('@standard-reasons')).toBe(Capability.StandardReasons);
  });

  it('is left out when a suite narrows the default, without needing a deviation', () => {
    const { declared, undeclared, knownDeviations } = resolveCapabilities(
      optionsFor({ capabilities: [Capability.Events] }),
    );

    expect(declared.has(Capability.StandardReasons)).toBe(false);
    expect(undeclared).toContain(Capability.StandardReasons);
    expect(knownDeviations).toEqual([]);
  });

  it('survives the single numeric type, which costs this SDK exactly one capability', () => {
    // The temptation is to generalise from @numeric-coercion to this one. A reason is a string on
    // the resolution details, observable whatever the accessor's arithmetic, so what is pinned is
    // the inexpressible list not growing by association.
    expect(isInexpressible(Capability.StandardReasons)).toBe(false);
    expect(Object.keys(INEXPRESSIBLE_CAPABILITIES)).toHaveLength(1);

    const { declared } = resolveCapabilities(
      optionsFor({ capabilities: [Capability.Events, Capability.StandardReasons] }),
    );

    expect(declared.has(Capability.StandardReasons)).toBe(true);
  });
});

describe('the @string-typing capability', () => {
  it('is declarable, unlike @numeric-coercion, the string accessor being its own accessor', () => {
    // The contrast worth pinning: both gate a question the specification leaves open, and a
    // capability gated for the same *reason* is not thereby gated by the same *mechanism*.
    expect(DECLARABLE_CAPABILITIES).toContain(Capability.StringTyping);
    expect(isReserved(Capability.StringTyping)).toBe(false);
    expect(isInexpressible(Capability.StringTyping)).toBe(false);
    expect(inexpressibleReason(Capability.StringTyping)).toBeUndefined();
  });

  it('resolves from the tag the gated outline and the structured scenario carry', () => {
    expect(capabilityForTag('@string-typing')).toBe(Capability.StringTyping);
  });

  it('is left out when a suite narrows the default, without needing a deviation', () => {
    // An untyped backend is the case this exists for, and must not have to file a deviation to say
    // so: that would report a sanctioned choice as a defect.
    const { declared, undeclared, knownDeviations } = resolveCapabilities(
      optionsFor({ capabilities: [Capability.Events] }),
    );

    expect(declared.has(Capability.StringTyping)).toBe(false);
    expect(undeclared).toContain(Capability.StringTyping);
    expect(knownDeviations).toEqual([]);
  });

  it('is accepted by a suite whose backend preserves types', () => {
    const { declared } = resolveCapabilities(
      optionsFor({ capabilities: [Capability.Events, Capability.StringTyping] }),
    );

    expect(declared.has(Capability.StringTyping)).toBe(true);
  });
});

describe('the @fully-typed-values capability', () => {
  // The asymmetry is what the split exists for: a partially typed store withholds this one as a
  // permitted absence while declaring @string-typing and failing it, which is a provider defect.
  it('composes with @string-typing rather than replacing it, and both are ordinary declarations', () => {
    const { declared, undeclared, knownDeviations } = resolveCapabilities(
      optionsFor({ capabilities: [Capability.StringTyping] }),
    );

    // The coarse claim declared, the fine one withheld, and no deviation owed for the withholding.
    expect(declared.has(Capability.StringTyping)).toBe(true);
    expect(declared.has(Capability.FullyTypedValues)).toBe(false);
    expect(undeclared).toContain(Capability.FullyTypedValues);
    expect(undeclared).not.toContain(Capability.StringTyping);
    expect(knownDeviations).toEqual([]);
  });

  it('is in the default declaration, so "declare everything" includes it', () => {
    // A capability missing from the default set would be withheld by every adoption that never named
    // one -- the quiet opposite of the hole the unknown-tag check closes.
    const { declared } = resolveCapabilities(
      optionsFor({ capabilities: [Capability.StringTyping, Capability.FullyTypedValues] }),
    );

    expect(DECLARABLE_CAPABILITIES).toContain(Capability.FullyTypedValues);
    expect(declared.has(Capability.FullyTypedValues)).toBe(true);
  });
});

describe('the @reinitialization capability', () => {
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
  it('declares every declarable capability by default, and neither undeclarable kind', () => {
    // "Declare everything" is the recommended starting point for a new adoption, and must not mean
    // "declare things nothing tested" or "things no provider in this language could be asked".
    const { declared } = resolveCapabilities(optionsFor({ newUnavailableProvider: () => ({}) as never }));

    expect([...declared].sort()).toEqual([...DECLARABLE_CAPABILITIES].sort());
    for (const capability of RESERVED_CAPABILITIES) {
      expect(declared.has(capability)).toBe(false);
    }
    for (const capability of Object.keys(INEXPRESSIBLE_CAPABILITIES)) {
      expect(declared.has(capability as Capability)).toBe(false);
    }
  });

  it('refuses a suite that declares a reserved capability', () => {
    // Refused rather than quietly corrected into a report that no longer matches what was written.
    expect(() => resolveCapabilities(optionsFor({ capabilities: [Capability.Events, Capability.Caching] }))).toThrow(
      /@caching, which no scenario carries/,
    );
  });

  it('names the reserved capability the suite asked for, deduplicated', () => {
    // A suite that named it twice must not be told about it twice.
    expect(() => resolveCapabilities(optionsFor({ capabilities: [Capability.Caching, Capability.Caching] }))).toThrow(
      /capabilities names @caching, which no scenario carries/,
    );
  });

  it('gates on every capability a scenario carries that a suite left out', () => {
    const { undeclared } = resolveCapabilities(optionsFor({ capabilities: [Capability.Events] }));

    // Three positions: a reserved capability is absent and gates nothing, @targeting has scenarios
    // so leaving it out gates them, and @numeric-coercion has scenarios and cannot be declared so
    // it is gated whatever the suite asked for.
    expect(undeclared).not.toContain(Capability.Events);
    expect(undeclared).not.toContain(Capability.Caching);
    expect(undeclared).toContain(Capability.Targeting);
    expect(undeclared).toContain(Capability.Stale);
    expect(undeclared).toContain(Capability.NumericCoercion);
    expect(undeclared.length).toBe(DECLARABLE_CAPABILITIES.length - 1 + Object.keys(INEXPRESSIBLE_CAPABILITIES).length);
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
    // whether '' counts.
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
    // Withdrawing @lifecycle would replace a failing scenario with a skip and make a defect look
    // deliberate; declaring both leaves the scenario running.
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

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
    // The list lives in one place so it cannot drift from the rule. That it matches the feature
    // files is checked by the harness on every run, against what actually ran.
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
    // @caching is the only reservation left, so the list the message quotes has one entry. It used
    // to read "@caching are reserved names". A reservation expiring is the expected course of
    // events rather than a surprise, so the message has to survive the next one too.
    expect(() => resolveCapabilities(optionsFor({ capabilities: [Capability.Caching] }))).toThrow(
      /@caching is a reserved name held open/,
    );
  });

  it('expire when a scenario carries one, which the harness checks against what actually ran', () => {
    // The other half of the reservation rule, and the half with no test until now: the harness
    // fails a run whose canonical features carry a tag this library still calls reserved, because
    // an out-of-date list makes a testable capability unclaimable -- the opposite mistake to
    // declaring an unverified one, and just as quiet. This is the whole of the detection; that
    // runProviderTck acts on it is asserted by every suite in this package passing, which they can
    // only do while no canonical scenario carries a reserved tag.
    expect(expiredReservations(['@events', '@object'])).toEqual([]);
    expect(expiredReservations([Capability.Caching, '@events'])).toEqual([Capability.Caching]);

    // Deduplicated, since the tags come from every scenario of every executed feature and a tag
    // carried twice is not two expiries.
    expect(expiredReservations([Capability.Caching, Capability.Caching])).toEqual([Capability.Caching]);
  });
});

describe('the capabilities this SDK cannot express', () => {
  // One of Appendix F's declaring rules: a capability the language's SDK cannot express is refused
  // by the implementation, not left to adopters. It replaced three per-suite omissions in this package,
  // each with its own comment restating the same property of JavaScript -- three places to get it
  // right before a single external adopter arrived, and a single wrong one would put a claim in a
  // report that no scenario could have verified.
  it('is @numeric-coercion and nothing else, the language having one numeric type', () => {
    expect(Object.keys(INEXPRESSIBLE_CAPABILITIES)).toEqual([Capability.NumericCoercion]);
    expect(isInexpressible(Capability.NumericCoercion)).toBe(true);
    expect(DECLARABLE_CAPABILITIES).not.toContain(Capability.NumericCoercion);
  });

  it('is a different thing from a reservation, and neither predicate answers for the other', () => {
    // The distinction Appendix F insists on. A reservation is global and temporary -- no scenario
    // anywhere carries the tag, and it expires the moment the specification adds one. This is one
    // language's and permanent: the scenarios exist and pass in Go, Java and Python. Collapsing them
    // into one "not declarable" predicate is the shortcut the rule exists to forbid.
    expect(isReserved(Capability.NumericCoercion)).toBe(false);
    expect(isInexpressible(Capability.Caching)).toBe(false);
    expect(ALL_CAPABILITIES).toContain(Capability.NumericCoercion);
  });

  it('refuses a suite that declares one, naming the SDK property rather than the rule', () => {
    // The error is the point: an adopter should not be able to make an unverifiable claim, and
    // should not have to know this about their language in the first place.
    expect(() =>
      resolveCapabilities(optionsFor({ capabilities: [Capability.Events, Capability.NumericCoercion] })),
    ).toThrow(/@numeric-coercion, which no provider written against this SDK can be asked about/);
    expect(() => resolveCapabilities(optionsFor({ capabilities: [Capability.NumericCoercion] }))).toThrow(
      /JavaScript has a single numeric type/,
    );
  });

  it('keeps the two refusals distinguishable, because only one of them ever expires', () => {
    // A reader of either message has to be able to tell "no scenario carries this yet" from "this
    // SDK cannot ask the question". One wording for both would send an adopter looking upstream for
    // a gap that is not there -- or waiting for a reservation that will never expire.
    const inexpressible = () => resolveCapabilities(optionsFor({ capabilities: [Capability.NumericCoercion] }));
    const reserved = () => resolveCapabilities(optionsFor({ capabilities: [Capability.Caching] }));

    expect(inexpressible).toThrow(/will not expire/);
    expect(inexpressible).not.toThrow(/reserved/);
    expect(reserved).toThrow(/reserved name held open/);
    expect(reserved).not.toThrow(/SDK/);
  });

  it('gates its scenarios in every run, which is what the per-suite omissions used to do', () => {
    // The half that makes the refusal safe. It cannot be declared, so it is never in `declared`, so
    // it is always in `undeclared` and always in the tag filter -- for a suite that narrows the
    // default and for one that takes it whole. No suite has to remember anything.
    const narrowed = resolveCapabilities(optionsFor({ capabilities: [Capability.Events] }));
    const whole = resolveCapabilities(optionsFor({ newUnavailableProvider: () => ({}) as never }));

    expect(narrowed.declared.has(Capability.NumericCoercion)).toBe(false);
    expect(narrowed.undeclared).toContain(Capability.NumericCoercion);
    expect(whole.declared.has(Capability.NumericCoercion)).toBe(false);
    expect(whole.undeclared).toContain(Capability.NumericCoercion);
  });

  it('refuses a deviation against one, which would assert a defect that cannot exist', () => {
    // Unlike the reserved case there *are* scenarios to deviate from, so the reason differs: none of
    // them was ever put to this provider, and an entry would report a language property as this
    // provider's defect.
    expect(() =>
      resolveCapabilities(
        optionsFor({
          knownDeviations: [KnownDeviation.untracked(Capability.NumericCoercion, 'narrows 0.5 to 0')],
        }),
      ),
    ).toThrow(/which this SDK cannot ask of any provider/);
  });

  it('states the reason once, so the refusal and the skip cannot word it differently', () => {
    // One accessor for one sentence. It is quoted verbatim in the configuration-time error and in
    // every skipped scenario's name -- see scenarioRunner.spec.ts, which asserts the same string.
    const reason = inexpressibleReason(Capability.NumericCoercion);

    expect(reason).toBe(INEXPRESSIBLE_CAPABILITIES[Capability.NumericCoercion]);
    expect(reason).toMatch(/single numeric type/);
    expect(inexpressibleReason(Capability.StandardReasons)).toBeUndefined();
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

describe('the @standard-reasons capability', () => {
  // Requirement 2.2.5 is a SHOULD that goes further than 2.2.4 does: it lets a provider populate
  // `reason` with one of the listed values "or some other string indicating the semantic reason for
  // the returned flag value". A provider reporting vendor-specific reasons is conformant, so the
  // tag is a claim the provider makes rather than an excuse it needs -- and the one thing a suite
  // must not do is declare it and record a deviation, which reports a sanctioned choice as a defect.
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
    // Worth pinning because the two arrive at the same place from opposite directions, and the
    // temptation is to generalise from one to the other. @numeric-coercion cannot be asked of any
    // provider here; a reason is a string on the resolution details and is observable whatever the
    // accessor's arithmetic, so this one is declarable and both in-memory suites declare it.
    //
    // Before the refusal moved into the library this was pinned as "a suite declaring one does not
    // get the other", which a suite could no longer get wrong: @numeric-coercion is refused outright.
    // What can still go wrong is the list growing by association, so that is what is pinned now.
    expect(isInexpressible(Capability.StandardReasons)).toBe(false);
    expect(Object.keys(INEXPRESSIBLE_CAPABILITIES)).toHaveLength(1);

    const { declared } = resolveCapabilities(
      optionsFor({ capabilities: [Capability.Events, Capability.StandardReasons] }),
    );

    expect(declared.has(Capability.StandardReasons)).toBe(true);
  });
});

describe('the @string-typing capability', () => {
  // The only normative statement near this is requirement 1.3.4, a SHOULD on the *client* rather
  // than on the provider. A backend that stores flag values as strings satisfies the string
  // accessor for every flag and has no mismatch to report, and requirement 2.2.3 asks it for the
  // resolved flag value -- which is what it returned. So the four scenarios are a capability
  // question rather than a conformance one, and withholding the tag is a declaration decision.
  it('is declarable, unlike @numeric-coercion, the string accessor being its own accessor', () => {
    // The contrast worth pinning. Both gate a question the specification leaves open, and only one
    // of them is inexpressible here: JavaScript collapses integer and float onto one accessor, but
    // getStringDetails is as distinct from getBooleanDetails as any pair of accessors gets. A
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
    // An untyped backend is the case this exists for, and it must not have to file a deviation to
    // say so -- the same rule @variants and @standard-reasons follow. Declaring it and recording a
    // deviation would report a sanctioned choice as a defect.
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
  it('declares every declarable capability by default, and neither undeclarable kind', () => {
    // "Declare everything" is the recommended starting point for a new adoption, and it must not
    // mean "declare things nothing tested" -- which is exactly how a real Java report came to
    // assert @targeting and @caching, back when both were reserved. Nor, now, "declare things no
    // provider in this language could be asked": the default is the declarable set, and that set is
    // where both exclusions are applied.
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
    expect(() => resolveCapabilities(optionsFor({ capabilities: [Capability.Caching, Capability.Caching] }))).toThrow(
      /capabilities names @caching, which no scenario carries/,
    );
  });

  it('gates on every capability a scenario carries that a suite left out', () => {
    const { undeclared } = resolveCapabilities(optionsFor({ capabilities: [Capability.Events] }));

    // A reserved capability is absent from the gate, and its absence gates nothing: no scenario
    // carries it, so there is nothing for 'not @caching' to exclude. @targeting is no longer in that
    // position -- it has scenarios, so leaving it out genuinely gates them. @numeric-coercion is in
    // a third position again: it has scenarios and cannot be declared, so it is gated here whatever
    // the suite asked for.
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

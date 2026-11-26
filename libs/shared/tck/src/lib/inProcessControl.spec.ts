import { asConnectionControl } from './control';
import { CHANGING_FLAG_KEY, canonicalFlagSet } from './flags';
import { InProcessControl } from './inProcessControl';

/**
 * Things the Gherkin cannot assert about itself.
 *
 * Each of these is a way the in-process control path could look correct while quietly making the
 * conformance suites meaningless.
 */
describe('InProcessControl', () => {
  const resolveChanging = async (provider: {
    resolveStringEvaluation: (k: string, d: string) => Promise<{ value: string }>;
  }) => (await provider.resolveStringEvaluation(CHANGING_FLAG_KEY, 'unset')).value;

  it('actually changes the resolved value, not just the event', async () => {
    // If changeFlag emitted an event without altering what the provider resolves, the scenario
    // would still pass its event assertion and certify a signal with nothing behind it.
    const control = new InProcessControl();
    const provider = control.newProvider();

    const before = await resolveChanging(provider);
    await control.changeFlag();
    const after = await resolveChanging(provider);

    expect(after).not.toEqual(before);
  });

  // The event itself is asserted end to end by the @configuration-change scenario in the in-memory
  // suite; duplicating it here would mean coupling to the SDK's event emitter.

  it('does not leak a change into the next scenario', async () => {
    // A leak would make the suite order-dependent, and the failure would look like a provider
    // defect.
    const control = new InProcessControl();

    const first = control.newProvider();
    const baseline = await resolveChanging(first);

    await control.changeFlag();
    expect(await resolveChanging(first)).not.toEqual(baseline);

    await control.prepareScenario();

    const second = control.newProvider();
    expect(await resolveChanging(second)).toEqual(baseline);
  });

  it('fails clearly when a flag is changed before a provider exists', async () => {
    // In-process the flag store and the provider are the same object, so there is nothing to change
    // before one exists. Saying so beats a TypeError.
    const control = new InProcessControl();
    await expect(control.changeFlag()).rejects.toThrow(/must create one/);
  });

  it('does not pretend to have a connection', () => {
    // The load-bearing one: a no-op disconnect would report the @stale scenarios as passed against
    // a provider that cannot go stale.
    expect(asConnectionControl(new InProcessControl())).toBeUndefined();
  });

  it('omits missing-flag from the canonical flag set', () => {
    // Seeding it would turn the FLAG_NOT_FOUND scenario green for the wrong reason.
    expect(Object.keys(canonicalFlagSet())).not.toContain('missing-flag');
  });

  /** What the canonical flag set resolves `key` to: its default variant's value. */
  const resolvedValue = (key: string): unknown => {
    const flag = canonicalFlagSet()[key];
    if (!flag) {
      throw new Error(`${key} is not in the canonical flag set`);
    }
    return flag.variants[flag.defaultVariant];
  };

  it('keeps the falsy values of the canonical flag set as values', () => {
    // Each falsy-value scenario's caller default is something else, so a `||` default between this
    // set and the provider would hand back the default and look like a provider defect.
    expect(resolvedValue('boolean-zero-flag')).toBe(false);
    expect(resolvedValue('integer-zero-flag')).toBe(0);
    expect(resolvedValue('string-zero-flag')).toBe('');
  });

  it('holds 2^53 - 1 exactly', () => {
    // Anything that had gone through a narrower type on the way here would be off by one or more,
    // and the @large-integers scenario would blame the provider.
    const value = resolvedValue('huge-integer-flag');

    expect(value).toBe(Number.MAX_SAFE_INTEGER);
    expect(Number.isSafeInteger(value)).toBe(true);
  });
});

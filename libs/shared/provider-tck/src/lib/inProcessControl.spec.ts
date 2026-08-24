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
  const resolveChanging = async (provider: { resolveStringEvaluation: (k: string, d: string) => Promise<{ value: string }> }) =>
    (await provider.resolveStringEvaluation(CHANGING_FLAG_KEY, 'unset')).value;

  it('actually changes the resolved value, not just the event', async () => {
    // The assumption every configuration-change scenario rests on. If changeFlag emitted an event
    // without altering what the provider resolves, the scenario would still pass its event
    // assertion and the suite would be certifying a signal with nothing behind it.
    const control = new InProcessControl();
    const provider = control.newProvider();

    const before = await resolveChanging(provider);
    await control.changeFlag();
    const after = await resolveChanging(provider);

    expect(after).not.toEqual(before);
  });

  // The event itself, and that it names the changed flag, is asserted end-to-end by the
  // @configuration-change scenario, which runs in this package's in-memory suite. Duplicating it
  // here would mean reaching into the SDK's event emitter directly, which is both a weaker
  // assertion and a coupling to an internal API.

  it('does not leak a change into the next scenario', async () => {
    // A leak here would make the suite order-dependent: a scenario running after the
    // configuration-change one would start with changing-flag already flipped, and the failure would
    // look like a provider defect.
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
    // The load-bearing one. A no-op disconnect would report the @stale scenarios as passed against a
    // provider that cannot go stale — precisely the silent-green failure a conformance suite must
    // never have.
    expect(asConnectionControl(new InProcessControl())).toBeUndefined();
  });

  it('omits missing-flag from the canonical flag set', () => {
    // The property the FLAG_NOT_FOUND scenario depends on. Seeding it would turn that scenario green
    // for the wrong reason, and nothing else in the suite would notice.
    expect(Object.keys(canonicalFlagSet())).not.toContain('missing-flag');
  });
});

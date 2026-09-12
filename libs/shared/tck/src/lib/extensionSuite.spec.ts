import { join } from 'node:path';
import type { StepDefinitions } from 'jest-cucumber';
import type { InMemoryProvider } from '@openfeature/server-sdk';
import { Capability } from './capability';
import { canonicalFlagSet } from './flags';
import { InProcessControl } from './inProcessControl';
import { runProviderTck } from './runProviderTck';
import { clientUnderTest, providerUnderTest } from './underTest';

/**
 * The reference **extension** adoption, and the end-to-end proof that `extensionFeatures` and
 * `extensionSteps` work.
 *
 * `inMemory.spec.ts` is the reference adoption for a provider with nothing extra to say.
 * This file is the one for a vendor that has provider-specific behaviour outside the shared
 * contract — flagd's `fractional` targeting is the motivating case — and it runs the canonical
 * suite and `fixtures/extension-features/vendor.feature` together: one `describe`, one provider
 * lifecycle, one capability declaration.
 *
 * What it demonstrates, and what a reviewer should look for in the output:
 *
 *   - every canonical scenario still runs, unchanged and unfiltered, alongside the vendor ones;
 *   - a vendor scenario mixes vendor steps and canonical steps freely;
 *   - a vendor scenario gets the TCK's `beforeEach`, so it starts from the seeded canonical backend
 *     rather than from whatever the previous scenario left behind;
 *   - a vendor step reaches the provider under test through `clientUnderTest()` and
 *     `providerUnderTest()`, which is the whole point of the extension point rather than a detail
 *     of it: without them an adopter's only way to evaluate a flag is a client of its own, which
 *     resolves against a different provider than the suite is testing;
 *   - the capability gate applies to vendor scenarios: the `@stale` one is reported as skipped,
 *     with the reason, exactly as a canonical `@stale` scenario is.
 */

/** The in-process control, extended with the one operation the vendor's own steps need. */
class VendorControl extends InProcessControl {
  private live: InMemoryProvider | undefined;

  override newProvider(): InMemoryProvider {
    this.live = super.newProvider();
    return this.live;
  }

  /**
   * The provider this scenario's factory produced, for the identity assertion.
   *
   * Exposed only so the accessor self-test has something to compare `providerUnderTest()` against
   * that cannot be faked: the same object, not merely an equivalent one.
   */
  created(): InMemoryProvider {
    if (!this.live) {
      throw new Error('the vendor control has not created a provider; put "Given a stable provider" before it');
    }
    return this.live;
  }

  override async prepareScenario(): Promise<void> {
    this.live = undefined;
    await super.prepareScenario();
  }

  /** Adds a flag the canonical set does not contain, which is what makes the scenario vendor-specific. */
  serve(key: string, value: string): void {
    if (!this.live) {
      throw new Error('the vendor rule step needs a provider; put "Given a stable provider" before it');
    }

    this.live.putConfiguration({
      ...canonicalFlagSet(),
      [key]: { variants: { vendor: value }, defaultVariant: 'vendor', disabled: false },
    });
  }
}

const control = new VendorControl();

/**
 * The vendor's step definitions.
 *
 * jest-cucumber's own shape, bound in the same call as the canonical steps. A matcher that also
 * matched a canonical step would be rejected as ambiguous, so this cannot redefine one.
 *
 * The two `then` steps are the accessor self-test. They are deliberately the only place in this
 * file that reaches the provider under test, and they reach it the way an adopter has to — through
 * the package's public accessors, with nothing handed to `StepDefinitions` but jest-cucumber's own
 * `given`/`when`/`then`. The `given` above, by contrast, reaches into this file's own control
 * object, which is exactly why it proves nothing about the extension point: it would still pass
 * with `clientUnderTest()` broken.
 */
const vendorSteps: StepDefinitions = ({ given, then }) => {
  given(/^the vendor rule serves "([^"]*)" for "([^"]*)"$/, (value: string, key: string) => {
    control.serve(key, value);
  });

  then(/^the suite's own client resolves "([^"]*)" for "([^"]*)"$/, async (expected: string, key: string) => {
    // The suite's client, in the suite's own domain. A client built here would sit in the default
    // domain behind a NoOpProvider and answer the default value, so the assertion distinguishes
    // the two rather than merely checking that something answered.
    expect(await clientUnderTest().getStringValue(key, 'none')).toBe(expected);
  });

  then(/^the suite's own provider is the instance the vendor control created$/, () => {
    expect(providerUnderTest()).toBe(control.created());
  });
};

runProviderTck({
  name: 'in-memory-with-extension',
  control,
  newProvider: () => control.newProvider(),
  // The in-memory suite's declaration, for the same reasons: see inMemory.spec.ts. Targeting stays
  // undeclared because the canonical flag format cannot express an InMemoryProvider
  // contextEvaluator, so targeting-key-flag's rule is inert here.
  capabilities: [
    Capability.Events,
    Capability.ConfigurationChange,
    Capability.Object,
    Capability.LargeIntegers,
    Capability.Variants,
    Capability.DisabledFlags,
  ],

  // Absolute, because paths resolve against the runner's working directory rather than this file's.
  // A directory named for what it holds, and nothing like the canonical `gherkin`/`features`.
  extensionFeatures: join(__dirname, '..', '..', 'fixtures', 'extension-features'),
  extensionSteps: vendorSteps,
});

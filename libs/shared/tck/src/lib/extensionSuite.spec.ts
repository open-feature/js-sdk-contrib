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
 * Where `inMemory.spec.ts` is the reference adoption for a provider with nothing extra to say, this
 * is the one for a vendor with provider-specific behaviour outside the shared contract. It runs the
 * canonical suite and `fixtures/extension-features/vendor.feature` together, and demonstrates that:
 *
 *   - every canonical scenario still runs, unchanged and unfiltered, alongside the vendor ones;
 *   - a vendor scenario mixes vendor and canonical steps freely, and gets the TCK's `beforeEach`;
 *   - a vendor step reaches the provider under test through `clientUnderTest()` and
 *     `providerUnderTest()`, a client of the adopter's own resolving against a different provider;
 *   - the capability gate applies to vendor scenarios, the `@stale` one skipping with its reason.
 */

/** The in-process control, extended with the one operation the vendor's own steps need. */
class VendorControl extends InProcessControl {
  private live: InMemoryProvider | undefined;

  override newProvider(): InMemoryProvider {
    this.live = super.newProvider();
    return this.live;
  }

  /**
   * The provider this scenario's factory produced, exposed only so the accessor self-test can
   * compare `providerUnderTest()` against the same object rather than an equivalent one.
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
 * The two `then` steps are the accessor self-test, and deliberately the only place here that reaches
 * the provider under test — through the package's public accessors, the way an adopter has to. The
 * `given` reaches into this file's own control object, which is why it proves nothing about the
 * extension point: it would still pass with `clientUnderTest()` broken.
 */
const vendorSteps: StepDefinitions = ({ given, then }) => {
  given(/^the vendor rule serves "([^"]*)" for "([^"]*)"$/, (value: string, key: string) => {
    control.serve(key, value);
  });

  then(/^the suite's own client resolves "([^"]*)" for "([^"]*)"$/, async (expected: string, key: string) => {
    // A client built here would sit in the default domain behind a NoOpProvider and answer the
    // default value, so this distinguishes the two rather than checking that something answered.
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
  // The in-memory suite's declaration, for the same reasons: see inMemory.spec.ts.
  capabilities: [
    Capability.Events,
    Capability.ConfigurationChange,
    Capability.Object,
    Capability.LargeIntegers,
    Capability.Variants,
    Capability.DisabledFlags,
    Capability.StandardReasons,
    Capability.StringTyping,
    Capability.FullyTypedValues,
  ],

  // Absolute, because paths resolve against the runner's working directory rather than this file's.
  extensionFeatures: join(__dirname, '..', '..', 'fixtures', 'extension-features'),
  extensionSteps: vendorSteps,
});

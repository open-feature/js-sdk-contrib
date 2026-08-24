import type { StepDefinitions } from 'jest-cucumber';
import { OpenFeature } from '@openfeature/server-sdk';
import { domainFor, readyTimeout } from '../options';
import type { TckState } from '../state';

/**
 * Steps that put a provider under test.
 *
 * `setProviderAndWait` is used for the healthy case because every scenario that follows assumes a
 * provider that has finished initialising; a suite that started evaluating before that would report
 * races in the TCK as defects in the provider.
 */
export const providerSteps =
  (state: TckState): StepDefinitions =>
  ({ given }) => {
    given(/^an? stable provider$/, async () => {
      const provider = await state.options.newProvider();
      if (!provider) {
        throw new Error('newProvider returned nothing');
      }

      const domain = domainFor(state.options);

      try {
        await withTimeout(
          OpenFeature.setProviderAndWait(domain, provider),
          readyTimeout(state.options),
          `the provider did not become ready within ${readyTimeout(state.options)}ms. The backend ` +
            `is up and seeded at this point, so either initialisation is genuinely failing or ` +
            `readyTimeoutMs is too short`,
        );
      } catch (error) {
        throw new Error(`registering the provider failed: ${(error as Error).message}`);
      }

      state.client = OpenFeature.getClient(domain);
    });

    given(/^an? unavailable provider$/, async () => {
      if (!state.options.newUnavailableProvider) {
        throw new Error(
          'newUnavailableProvider is not set but an @unavailable scenario ran. This is a ' +
            'test-configuration bug rather than a provider defect: the suite declared ' +
            'Capability.UnavailableInit without supplying a provider that cannot reach its ' +
            'backend. Remove that capability, or supply the factory.',
        );
      }

      const provider = await state.options.newUnavailableProvider();
      const domain = domainFor(state.options);

      // Registration is expected to reject, because the provider cannot reach anything. That is not
      // a failure: what the contract requires is an observable error state, which the scenario
      // checks through the event and the client status. Swallowing it here keeps the scenario about
      // the provider's behaviour rather than about how registration reports it.
      await OpenFeature.setProviderAndWait(domain, provider).catch(() => undefined);

      state.client = OpenFeature.getClient(domain);
    });
  };

/**
 * Rejects if `promise` has not settled within `ms`.
 *
 * `setProviderAndWait` has no timeout of its own, and a provider that never settles would otherwise
 * hang the scenario until Jest's own timeout fires with a far less useful message.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

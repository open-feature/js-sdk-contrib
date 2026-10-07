import type { StepDefinitions } from 'jest-cucumber';
import { OpenFeature } from '@openfeature/server-sdk';
import { domainFor, readyTimeout } from '../options';
import type { LifecycleOperation, TckState } from '../state';

/**
 * Steps that put a provider under test, and the ones that drive its lifecycle directly.
 *
 * `setProviderAndWait` for the healthy case, because a suite that started evaluating before
 * initialisation finished would report races in the TCK as defects in the provider.
 *
 * The shutdown steps call the provider's own `onClose` and `initialize` rather than the SDK's: going
 * through the registry would test its bookkeeping as much as the provider, and it only shuts a
 * provider down once per registration, so a scenario could not do it twice.
 */
export const providerSteps =
  (state: TckState): StepDefinitions =>
  ({ given, when, then }) => {
    given(/^an? stable provider$/, async () => {
      const provider = await state.options.newProvider();
      if (!provider) {
        throw new Error('newProvider returned nothing');
      }
      state.provider = provider;

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
      state.provider = provider;
      const domain = domainFor(state.options);

      // Registration is expected to reject, the provider being able to reach nothing. What the
      // contract requires is an observable error state, which the scenario checks through the event
      // and the client status, so swallowing it here keeps the scenario about the provider.
      await OpenFeature.setProviderAndWait(domain, provider).catch(() => undefined);

      state.client = OpenFeature.getClient(domain);
    });

    when('the provider is shut down', async () => {
      // The registry is not told, so the client still points at the same instance and an evaluation
      // after "the provider is initialized again" reaches the very object that was shut down and
      // brought back. The SDK closes it once more when the scenario ends, which is harmless.
      const provider = state.requireProvider();
      await recordLifecycleCall(state, 'shutdown', () => provider.onClose?.());
    });

    when('the provider is initialized again', async () => {
      // With the empty context and domain the SDK handed it the first time. Direct for the same
      // reason as the shutdown step: what is under test is that the instance itself reverts to an
      // initialisable state.
      const provider = state.requireProvider();
      await recordLifecycleCall(state, 'initialize', () => provider.initialize?.({}, domainFor(state.options)));
    });

    then(/^the shutdown should have completed within (\d+)ms$/, (millis: string) => {
      // The scenario runs against a backend that will never answer, so this asserts that shutdown
      // returns rather than waiting for a graceful close that cannot happen. One given up on for
      // outlasting readyTimeoutMs fails here too, its recorded duration being the wait.
      const record = state.requireShutdown();
      const bound = Number(millis);
      if (record.durationMs > bound) {
        throw new Error(
          `shutdown took ${Math.round(record.durationMs)}ms, expected it to complete within ` +
            `${millis}ms. A shutdown that waits on a backend that is gone hangs the host ` +
            `application's own shutdown`,
        );
      }
    });

    then('the provider metadata name should not be empty', () => {
      // Asked of the provider rather than of the client's metadata, which answers for whatever the
      // registry holds under the domain.
      const provider = state.requireProvider();
      const name: unknown = provider.metadata?.name;
      if (typeof name !== 'string' || name.trim() === '') {
        throw new Error(
          `the provider metadata name is ${JSON.stringify(name)}, expected a non-empty string. A ` +
            `conformance report keyed on the name cannot be attributed without one`,
        );
      }
    });
  };

/**
 * Makes one direct lifecycle call and records how it went, throwing nothing.
 *
 * A throw is recorded rather than propagated, because "no exception should have been thrown" is a
 * step of its own. A call that outlasts `readyTimeoutMs` is given up on and recorded as a timeout
 * with the time waited, so a hanging shutdown fails with a message rather than on Jest's own timeout.
 */
async function recordLifecycleCall(
  state: TckState,
  operation: LifecycleOperation,
  call: () => Promise<void> | void | undefined,
): Promise<void> {
  const limit = readyTimeout(state.options);
  const started = Date.now();
  let thrown: unknown;

  try {
    // Wrapped so a synchronous throw is recorded like a rejection, and a provider with no such
    // function counts as having returned at once.
    await withTimeout(
      Promise.resolve().then(call),
      limit,
      `${operation} did not return within ${limit}ms. A lifecycle call that never settles hangs ` +
        `the host application; raise readyTimeoutMs only if the provider is genuinely slower than this`,
    );
  } catch (error) {
    // `undefined` marks a clean call, so a provider throwing literally `undefined` still records.
    thrown = error === undefined ? new Error(`${operation} threw undefined`) : error;
  }

  state.lifecycle.push({ operation, durationMs: Date.now() - started, thrown });
}

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

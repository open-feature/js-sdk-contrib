import type { StepDefinitions } from 'jest-cucumber';
import { OpenFeature } from '@openfeature/server-sdk';
import { domainFor, readyTimeout } from '../options';
import type { LifecycleOperation, TckState } from '../state';

/**
 * Steps that put a provider under test, and the ones that drive its lifecycle directly.
 *
 * `setProviderAndWait` is used for the healthy case because every scenario that follows assumes a
 * provider that has finished initialising; a suite that started evaluating before that would report
 * races in the TCK as defects in the provider.
 *
 * The shutdown steps call the provider's own `onClose` and `initialize`, not the SDK's. The SDK
 * shuts a provider down when it is replaced, but going that way would test the registry's
 * bookkeeping as much as the provider, and Appendix B already does that. Calling the instance is
 * also what lets a scenario shut it down twice: the registry only ever does so once per
 * registration.
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
      // The conformance report names the provider as the provider names itself, not as the suite
      // names it. Recorded before registration so that a provider whose initialisation fails is
      // still identified.
      state.providerName = provider.metadata?.name || state.providerName;

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
      state.providerName = provider.metadata?.name || state.providerName;

      // Registration is expected to reject, because the provider cannot reach anything. That is not
      // a failure: what the contract requires is an observable error state, which the scenario
      // checks through the event and the client status. Swallowing it here keeps the scenario about
      // the provider's behaviour rather than about how registration reports it.
      await OpenFeature.setProviderAndWait(domain, provider).catch(() => undefined);

      state.client = OpenFeature.getClient(domain);
    });

    when('the provider is shut down', async () => {
      // The registry is not told. The client still points at the same instance, so an evaluation
      // after "the provider is initialized again" reaches the very object that was shut down and
      // brought back, which is what that scenario asserts. And when the scenario ends the SDK
      // closes the provider once more on its own -- a second call, which requirement 2.5.3 makes
      // harmless.
      const provider = state.requireProvider();
      await recordLifecycleCall(state, 'shutdown', () => provider.onClose?.());
    });

    when('the provider is initialized again', async () => {
      // With an empty context and the domain the provider was registered under, which is what the
      // SDK handed it the first time. Direct for the same reason as the shutdown step: re-registering
      // through the SDK would create a new registration around the same instance, and what is under
      // test is that the instance itself reverts to an initialisable state.
      const provider = state.requireProvider();
      await recordLifecycleCall(state, 'initialize', () => provider.initialize?.({}, domainFor(state.options)));
    });

    then(/^the shutdown should have completed within (\d+)ms$/, (millis: string) => {
      // The scenario using this runs against a backend that will never answer, so what it asserts
      // is that shutdown returns rather than waiting for a graceful close that cannot happen. A
      // shutdown that was given up on because it outlasted readyTimeoutMs fails here too: its
      // recorded duration is however long the suite waited before moving on.
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
      // Asked of the provider rather than of the client's metadata, which would answer for
      // whatever the registry holds under the domain: the same object here, but the question is
      // about the provider (requirement 2.1.1).
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
 * A throw or rejection is recorded rather than propagated, for the same reason an evaluation's is:
 * "no exception should have been thrown" is a step of its own, and a scenario that wants a throw to
 * fail says so there.
 *
 * A call that outlasts `readyTimeoutMs` is given up on and recorded as a timeout with the time
 * waited, so a hanging shutdown fails its scenario with a message rather than hanging the session
 * until Jest's own timeout fires with a far less useful one.
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
    // Wrapped in a promise so a synchronous throw from the provider is recorded like a rejection,
    // and a provider that has no such function at all counts as having returned at once.
    await withTimeout(
      Promise.resolve().then(call),
      limit,
      `${operation} did not return within ${limit}ms. A lifecycle call that never settles hangs ` +
        `the host application; raise readyTimeoutMs only if the provider is genuinely slower than this`,
    );
  } catch (error) {
    // `undefined` marks a clean call, so a provider that throws literally `undefined` is still
    // recorded as having thrown something.
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

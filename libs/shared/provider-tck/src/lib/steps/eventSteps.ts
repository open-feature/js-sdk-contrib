import type { StepDefinitions } from 'jest-cucumber';
import { ProviderStatus, ServerProviderEvents } from '@openfeature/server-sdk';
import { asConnectionControl, unsupportedControl } from '../control';
import { eventTimeout } from '../options';
import { EventRecorder } from '../state';
import type { TckState } from '../state';

const EVENT_BY_NAME: Record<string, ServerProviderEvents> = {
  ready: ServerProviderEvents.Ready,
  stale: ServerProviderEvents.Stale,
  error: ServerProviderEvents.Error,
  change: ServerProviderEvents.ConfigurationChanged,
};

const STATUS_BY_NAME: Record<string, ProviderStatus> = {
  ready: ProviderStatus.READY,
  stale: ProviderStatus.STALE,
  error: ProviderStatus.ERROR,
};

function eventFor(name: string): ServerProviderEvents {
  const event = EVENT_BY_NAME[name];
  if (!event) {
    throw new Error(`unknown event kind '${name}'`);
  }
  return event;
}

/** Steps covering provider events, connection loss and client status. */
export const eventSteps =
  (state: TckState): StepDefinitions =>
  ({ given, when, then }) => {
    given(/^an? (ready|stale|error|change) event handler$/, (name: string) => {
      // Handlers are attached after the provider is registered. The SDK runs a handler immediately
      // when the provider is already in the matching state, so "Given a stable provider" followed by
      // "And a ready event handler" is not a race.
      const event = eventFor(name);
      if (state.recorders.has(event)) {
        return;
      }

      const recorder = new EventRecorder(name);
      state.recorders.set(event, recorder);
      state.requireClient().addHandler(event, (details) => recorder.record(details));
    });

    when(/^a (ready|stale|error|change) event was fired$/, async (name: string) => {
      // Consuming here is what lets the stale scenario assert a *second*, distinct PROVIDER_READY
      // once the backend is back.
      await state.requireRecorder(eventFor(name), name).next(eventTimeout(state.options));
    });

    then(/^the (ready|stale|error|change) event handler should have been executed$/, async (name: string) => {
      await state.requireRecorder(eventFor(name), name).next(eventTimeout(state.options));
    });

    then(
      /^the (ready|stale|error|change) event handler should have been executed within (\d+)ms$/,
      async (name: string, millis: string) => {
        // These scenarios assert promptness, not merely eventual arrival: a provider that cannot
        // reach its backend has to say so quickly, because an application blocked on provider
        // registration is down. The explicit bound therefore overrides eventTimeoutMs.
        await state.requireRecorder(eventFor(name), name).next(Number(millis));
      },
    );

    then('the flag should be part of the event payload', () => {
      // Naming the changed flags is what makes the event actionable: a consumer caching evaluations
      // needs to know what to invalidate, and an event carrying no keys forces it to invalidate
      // everything.
      const flag = state.requireFlag();
      const recorder = state.requireRecorder(ServerProviderEvents.ConfigurationChanged, 'change');

      if (!recorder.last) {
        throw new Error(
          'no configuration-change event has been consumed in this scenario: a "the change event ' +
            'handler should have been executed" step must come first',
        );
      }

      const changed = recorder.last.flagsChanged ?? [];
      if (changed.includes(flag.key)) {
        return;
      }
      if (changed.length === 0) {
        throw new Error(`the configuration-change event carried no changed flags, expected it to name '${flag.key}'`);
      }
      throw new Error(
        `the configuration-change event named [${changed.join(' ')}], expected it to include '${flag.key}'`,
      );
    });

    when('the connection is lost', async () => {
      const connection = asConnectionControl(state.options.control);
      if (!connection) {
        throw unsupportedControl(state.options.control, 'disconnect');
      }
      await connection.disconnect();
    });

    when('the connection is restored', async () => {
      const connection = asConnectionControl(state.options.control);
      if (!connection) {
        throw unsupportedControl(state.options.control, 'reconnect');
      }
      await connection.reconnect();
    });

    then(/^the client should be in (ready|stale|error) state$/, (name: string) => {
      // Checked after the corresponding event has been consumed, so no polling is needed: if the
      // event arrived, the status the client reports is already current.
      const expected = STATUS_BY_NAME[name];
      if (!expected) {
        throw new Error(`unknown provider status '${name}'`);
      }

      const actual = state.requireClient().providerStatus;
      if (actual !== expected) {
        throw new Error(`client reports status '${actual}', expected '${expected}'`);
      }
    });
  };

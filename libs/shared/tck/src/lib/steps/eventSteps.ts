import type { StepDefinitions } from 'jest-cucumber';
import { ProviderStatus, ServerProviderEvents } from '@openfeature/server-sdk';
import type { EventDetails } from '@openfeature/server-sdk';
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
      // Attached after the provider is registered, which is not a race: the SDK runs a handler
      // immediately when the provider is already in the matching state.
      const event = eventFor(name);
      if (state.recorders.has(event)) {
        return;
      }

      // The ordinal source is the scenario's, not the recorder's: it is what lets a later step ask
      // whether an event of another kind arrived before this one.
      const recorder = new EventRecorder(name, () => state.nextEventOrdinal());
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
        // Promptness rather than eventual arrival: an application blocked on provider registration
        // is down. The explicit bound therefore overrides eventTimeoutMs.
        await state.requireRecorder(eventFor(name), name).next(Number(millis));
      },
    );

    then(
      /^the (ready|stale|error|change) event handler should have been executed with no (ready|stale|error|change) event before it$/,
      async (name: string, forbidden: string) => {
        // This is how a scenario says "and no error": as an *order*, not as a window. "No error
        // event fired" can only be answered over some stretch of time, and at any instant an event
        // that never fires and one that fires a moment later are the same observation -- so a step
        // asking it that way either slows every run down or passes because nothing has arrived yet.
        // "No error before the provider came back ready" is a question about what was recorded, and
        // the recording answers it with no clock involved.
        const recorder = state.requireRecorder(eventFor(name), name);

        // Demanded before the wait, and deliberately: an absence nobody listened for is not an
        // observation, and a scenario that forgot the handler would otherwise pass this step
        // vacuously -- the one failure mode a negative assertion cannot afford.
        const forbiddenRecorder = state.requireRecorder(eventFor(forbidden), forbidden);

        const awaited = await recorder.next(eventTimeout(state.options));
        const earlier = forbiddenRecorder.unclaimed;

        if (earlier && earlier.ordinal < awaited.ordinal) {
          throw new Error(
            `a ${forbidden} event was recorded before the ${name} event this step awaited ` +
              `(arrival ${earlier.ordinal} against ${awaited.ordinal}). The scenario is about the ` +
              `route the provider took and not only where it ended up: an application handling ` +
              `${forbidden} events has already acted on that one by the time ${name} arrives`,
          );
        }
      },
    );

    then('the flag should be part of the event payload', () => {
      // Naming the changed flags is what makes the event actionable: an event carrying no keys
      // forces a caching consumer to invalidate everything.
      const flag = state.requireFlag();
      const recorder = state.requireRecorder(ServerProviderEvents.ConfigurationChanged, 'change');

      if (!recorder.last) {
        throw new Error(
          'no configuration-change event carrying a payload has been consumed in this scenario: a ' +
            '"the change event handler should have been executed" step must come first, and the ' +
            'event must arrive with details',
        );
      }

      // `flagsChanged` widens to `unknown` on the union of all event payloads, through their index
      // signature. Narrowing restores `string[] | undefined`, and is sound because this recorder is
      // by construction the change recorder.
      const changeDetails = recorder.last as EventDetails<ServerProviderEvents.ConfigurationChanged>;
      const changed = changeDetails.flagsChanged ?? [];
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

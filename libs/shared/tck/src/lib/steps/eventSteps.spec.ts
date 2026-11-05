import { ServerProviderEvents } from '@openfeature/server-sdk';
import type { Client, EventHandler } from '@openfeature/server-sdk';
import type { TckState } from '../state';
import { eventSteps } from './eventSteps';
import type { StepRunner } from './stepHarness.testkit';
import { bindSteps, stateUnderTest } from './stepHarness.testkit';

/**
 * What the event assertions read, and what they leave behind.
 *
 * Both halves matter to a chain like stale, then error, then ready: each assertion has to see the
 * records an earlier one did not claim, or a question about their order is answered from an emptied
 * queue. No canonical feature file asks the ordering question, so this is the only place the step
 * runs at all — matcher included.
 */
describe('the event ordering assertion', () => {
  /** A client that only collects handlers, so a test fires events in the order it wants to test. */
  class RecordingClient {
    private readonly handlers = new Map<ServerProviderEvents, EventHandler[]>();

    addHandler(event: ServerProviderEvents, handler: EventHandler): void {
      const existing = this.handlers.get(event) ?? [];
      existing.push(handler);
      this.handlers.set(event, existing);
    }

    /** Delivers one event of `event`'s kind to whatever registered for it. */
    fire(event: ServerProviderEvents): void {
      for (const handler of this.handlers.get(event) ?? []) {
        void handler({ providerName: 'recording', domain: 'tck' });
      }
    }
  }

  let state: TckState;
  let client: RecordingClient;
  let run: StepRunner;

  beforeEach(() => {
    // A short event timeout: three of these assertions are about something never arriving, and the
    // suite's own 12s default would spend a minute proving it.
    state = stateUnderTest({ eventTimeoutMs: 50 });
    client = new RecordingClient();
    state.client = client as unknown as Client;
    run = bindSteps(eventSteps(state));
  });

  const bothHandlers = async (): Promise<void> => {
    await run('a ready event handler');
    await run('an error event handler');
  };

  const orderingStep = 'the ready event handler should have been executed with no error event before it';

  it('fails when an event of the forbidden kind was recorded first', async () => {
    await bothHandlers();

    client.fire(ServerProviderEvents.Error);
    client.fire(ServerProviderEvents.Ready);

    await expect(run(orderingStep)).rejects.toThrow(/error event was recorded before the ready event/);
  });

  it('passes on the same two events in the other order, and leaves the error for the next step', async () => {
    await bothHandlers();

    client.fire(ServerProviderEvents.Ready);
    client.fire(ServerProviderEvents.Error);

    await expect(run(orderingStep)).resolves.toBeUndefined();
    // The ready was claimed and the error was not: a step asking for it still finds it.
    await expect(run('the error event handler should have been executed')).resolves.toBeUndefined();
  });

  it('waits for the event it is about rather than passing on an empty recording', async () => {
    // The failure mode a negative assertion falls into: nothing has happened yet, so nothing has
    // gone wrong yet either.
    await bothHandlers();

    await expect(run(orderingStep)).rejects.toThrow(/waiting for a ready event/);
  });

  it('still sees an error that a different kind of await ran past', async () => {
    // Java's bug, pinned here: one queue drained through the match discarded the error recorded
    // before the awaited event, and the ordering question had nothing left to object to. Separate
    // queues per kind are what make this hold.
    await bothHandlers();
    await run('a change event handler');

    client.fire(ServerProviderEvents.Error);
    client.fire(ServerProviderEvents.ConfigurationChanged);
    client.fire(ServerProviderEvents.Ready);
    await run('the change event handler should have been executed');

    await expect(run(orderingStep)).rejects.toThrow(/error event was recorded before the ready event/);
  });

  it('refuses to answer about a kind no handler was registered for', async () => {
    // An absence nobody listened for is not an observation. Vacuously passing here would make the
    // assertion decorative in exactly the scenario that forgot the handler.
    await run('a ready event handler');
    client.fire(ServerProviderEvents.Ready);

    await expect(run(orderingStep)).rejects.toThrow(/no handler was registered for error/);
  });

  it('claims one record per await, so two awaits need two events', async () => {
    await bothHandlers();
    client.fire(ServerProviderEvents.Ready);
    client.fire(ServerProviderEvents.Error);

    await expect(run(orderingStep)).resolves.toBeUndefined();

    // The one ready record was claimed by the step above; a second await waits for a newer one.
    await expect(run('the ready event handler should have been executed')).rejects.toThrow(/waiting for a ready event/);
  });
});

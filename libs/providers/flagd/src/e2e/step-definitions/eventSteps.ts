import { State, Steps } from './state';
import { ConfigChangeEvent, ServerProviderEvents } from "@openfeature/core";
import { waitFor } from './utils';

export const eventSteps: Steps =
  (state: State) =>
  ({ given, when, then }) => {
    beforeEach(() => {
      state.events = [];
    });

    function map(eventType: string): ServerProviderEvents {
      switch (eventType) {
        case 'error':
          return ServerProviderEvents.Error;
        case 'ready':
          return ServerProviderEvents.Ready;
        case 'stale':
          return ServerProviderEvents.Stale;
        case 'change':
          return ServerProviderEvents.ConfigurationChanged;

        default:
          throw new Error('unknown eventtype');
      }
    }

    given(/a (.*) event handler/, async (type: string) => {
      state.client?.addHandler(map(type), (details) => {
        state.events.push({ type, details });
      });
    });

    then(/^the (.*) event handler should have been executed$/, async (type: string) => {
      await waitFor(() => expect(state.events.find((value) => value.type == type)).toBeDefined(), { timeout: 20000 });
      expect(state.events.find((value) => value.type == type)).toBeDefined();
      state.events = [];
    });

    then(/^the (.*) event handler should have been executed within (\d+)ms$/, async (type: string, ms: number) => {
      await waitFor(() => expect(state.events.find((value) => value.type == type)).toBeDefined(), { timeout: ms });
      const actual = state.events.find((value) => value.type == type);
      expect(actual).toBeDefined();
      state.events = [];
      console.error('here bin cih');
    });

    when(/^a (.*) event was fired$/, async (type: string) => {
      await waitFor(() => expect(state.events.find((value) => value.type == type)), { timeout: 2000 });
      expect(state.events.find((value) => value.type == type)).toBeDefined();
      state.events = [];
    });

    then('the flag should be part of the event payload', async () => {
      await waitFor(() => expect(state.events.find((value) => value.type == 'change')), { timeout: 2000 });
      state.events = [];
    });
  };

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
      await waitFor(() => expect(state.events.find((value) => value.type == type)).toBeDefined(), { timeout: 10000 });
      expect(state.events.find((value) => value.type == type)).toBeDefined();
      state.events = state.events.filter((a) => a.type !== type);
      console.error('here bin cih');
    });

    then(/^the (.*) event handler should have been executed within (\d+)ms$/, async (type: string, ms: number) => {
      await waitFor(() => expect(state.events.find((value) => value.type == type)).toBeDefined(), { timeout: ms });
      const actual = state.events.find((value) => value.type == type);
      expect(actual).toBeDefined();
      state.events = state.events.filter((a) => a.type !== type);
      console.error('here bin cih');
    });

    when(/^a (.*) event was fired$/, () => {});
  };

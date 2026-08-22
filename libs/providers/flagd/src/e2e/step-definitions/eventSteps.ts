import { ServerProviderEvents } from '@openfeature/server-sdk';
import type { State, Steps } from './state';
import { waitFor } from './utils';

const DEFAULT_TIMEOUT_MS = 20000;

export const eventSteps: Steps =
  (state: State) =>
  ({ given, when, then }) => {
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

    // drain up to and including the first match, so an old event can't satisfy a later assertion for a new one
    async function assertExecuted(type: string, timeout: number) {
      await waitFor(() => expect(state.assertedEvents.find((value) => value.type == type)).toBeDefined(), { timeout });
      while (state.assertedEvents.length) {
        const head = state.assertedEvents.shift();
        if (head?.type == type) {
          break;
        }
      }
    }

    given(/a (.*) event handler/, async (type: string) => {
      state.client?.addHandler(map(type), (details) => {
        const event = { type, details };
        state.assertedEvents.push(event);
        state.allEvents.push(event);
      });
    });

    then(/^the (.*) event handler should have been executed$/, async (type: string) => {
      await assertExecuted(type, DEFAULT_TIMEOUT_MS);
    });

    then(/^the (.*) event handler should not have been executed$/, async (type: string) => {
      // check the full log; positive assertions may have drained this type from assertedEvents
      expect(state.allEvents.find((value) => value.type == type)).toBeUndefined();
    });

    then(/^the (.*) event handler should have been executed within (\d+)ms$/, async (type: string, ms: number) => {
      await assertExecuted(type, ms);
    });

    when(/^a (.*) event was fired$/, async (type: string) => {
      await waitFor(() => expect(state.assertedEvents.find((value) => value.type == type)).toBeDefined(), {
        timeout: DEFAULT_TIMEOUT_MS,
      });
    });

    then('the flag should be part of the event payload', async () => {
      const hasFlag = (value: { type: string; details?: unknown }) => {
        const flagsChanged = (value.details as { flagsChanged?: string[] } | undefined)?.flagsChanged;
        return value.type == 'change' && !!state.flag?.name && !!flagsChanged?.includes(state.flag.name);
      };
      await waitFor(() => expect(state.assertedEvents.find(hasFlag)).toBeDefined(), { timeout: DEFAULT_TIMEOUT_MS });
    });
  };

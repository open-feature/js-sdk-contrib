import type { JsonObject } from '@openfeature/server-sdk';
import type { State, Steps } from './state';
import { mapValueToType } from './utils';

export const contextSteps: Steps =
  (state: State) =>
  ({ given, when, then }) => {
    beforeEach(() => (state.context = undefined));
    given(
      /^a context containing a key "(.*)", with type "(.*)" and with value "(.*)"$/,
      (key: string, type: string, value: string) => {
        if (state.context == undefined) {
          state.context = {};
        }
        state.context[key] = mapValueToType(value, type);
      },
    );
    given(
      /^a context containing a nested property with outer key "(.*)" and inner key "(.*)", with value "(.*)"$/,
      (outer: string, inner: string, value) => {
        if (state.context == undefined) {
          state.context = {};
        }
        state.context[outer] = { ...(state.context[outer] as JsonObject), [inner]: value };
      },
    );
    given(/^a context containing a targeting key with value "(.*)"$/, (key) => {
      if (state.context == undefined) {
        state.context = {};
      }
      state.context.targetingKey = key;
    });
  };

import { State, Steps } from './state';
import { mapValueToType, waitFor } from './utils';

export const flagSteps: Steps =
  (state: State) =>
  ({ given, when, then }) => {
    beforeEach(() => {
      state.flag = undefined;
    });

    given(
      /^a (.*)-flag with key "(.*)" and a default value "(.*)"$/,
      (type: string, name: string, defaultValue: string) => {
        state.flag = {
          name,
          type,
          defaultValue: mapValueToType(defaultValue, type),
        };
      },
    );

    when('the flag was evaluated with details', async () => {
      switch (state.flag?.type) {
        case 'Boolean':
          state.details = await state.client?.getBooleanDetails(
            state.flag?.name,
            <boolean>state.flag?.defaultValue,
            state.context,
          );
          break;
        case 'String':
          state.details = await state.client?.getStringDetails(
            state.flag?.name,
            <string>state.flag?.defaultValue,
            state.context,
          );
          break;
        case 'Integer':
        case 'Float':
          state.details = await state.client?.getNumberDetails(
            state.flag?.name,
            <number>state.flag?.defaultValue,
            state.context,
          );
          break;
        case 'Object':
          state.details = await state.client?.getObjectDetails(
            state.flag?.name,
            <boolean>state.flag?.defaultValue,
            state.context,
          );
          break;
        default:
          throw new Error('unknown type');
      }
    });

    then(/^the resolved details value should be "(.*)"$/, (arg0) => {
      expect(state.details?.value).toEqual(mapValueToType(arg0, state.flag!.type));
    });
    then(/^the reason should be "(.*)"$/, (arg0) => {
      expect(state.details?.reason).toBe(arg0);
    });
    then(/^the variant should be "(.*)"$/, (arg0) => {
      expect(state.details?.variant).toBe(arg0);
    });
    when('the flag was modified', async () => {
      await waitFor(
        () =>
          expect(
            state.events.find(
              (value) => value.type == 'change' && (value.details?.flagsChanged as string[]).includes(state.flag!.name),
            ),
          ).toBeDefined(),
        { timeout: 5000 },
      );
    });
  };

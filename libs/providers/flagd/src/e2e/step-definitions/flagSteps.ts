import type { State, Steps } from './state';
import { mapValueToType } from './utils';

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

    then(/^the reason should be "(.*)"$/, (expectedReason) => {
      expect(state.details?.reason).toBe(expectedReason);
    });

    then(/^the variant should be "(.*)"$/, (expectedVariant) => {
      expect(state.details?.variant).toBe(expectedVariant);
    });

    then('the resolved metadata should contain', (table) => {
      // TODO: implement metadata tests, https://github.com/open-feature/js-sdk-contrib/issues/1290
    });

    then('the resolved metadata is empty', () => {
      // TODO: implement metadata tests, https://github.com/open-feature/js-sdk-contrib/issues/1290
    });
  };

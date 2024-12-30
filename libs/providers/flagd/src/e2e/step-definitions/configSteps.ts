import { StepsDefinitionCallbackOptions } from 'jest-cucumber/dist/src/feature-definition-creation';
import { State, Steps } from './state';
import { CacheOption, getConfig, ResolverType } from '../../lib/configuration';
import { mapValueToType } from "./utils";

export const configSteps: Steps = (state: State) => {
  function mapName(name: string): string {
    switch (name) {
      case 'resolver':
        return 'resolverType';
      default:
        return name;
    }
  }

  return ({ given, when, then }: StepsDefinitionCallbackOptions) => {
    beforeEach(() => {
      state.options = {};
    });
    given(/^an option "(.*)" of type "(.*)" with value "(.*)"$/, (name: string, type: string, value: string) => {
      state.options[mapName(name)] = mapValueToType(value, type);
    });
    given(/^an environment variable "(.*)" with value "(.*)"$/, (name, value) => {
      process.env[name] = value;
    });
    when('a config was initialized', () => {
      state.config = getConfig(state.options);
    });

    then(
      /^the option "(.*)" of type "(.*)" should have the value "(.*)"$/,
      (name: string, type: string, value: string) => {
        const expected = mapValueToType(value, type);
        const propertyName = mapName(name);
        expect(state.config).toHaveProperty(propertyName);
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        const configElement = state.config[propertyName];
        expect(configElement).toBe(expected);
      },
    );
  };
};

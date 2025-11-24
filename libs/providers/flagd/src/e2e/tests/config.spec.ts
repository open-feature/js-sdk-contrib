import { configSteps } from '../step-definitions/configSteps';
import type { State } from '../step-definitions/state';
import { autoBindSteps, loadFeatures } from 'jest-cucumber';
import { CONFIG_FEATURE } from '../constants';

jest.setTimeout(50000);
describe('config', () => {
  const state: State = {
    resolverType: 'in-process',
    options: {},
    config: undefined,
    events: [],
  };
  autoBindSteps(
    loadFeatures(CONFIG_FEATURE, {
      scenarioNameTemplate: (vars) => {
        return `${vars.scenarioTitle} (${vars.scenarioTags.join(',')} ${vars.featureTags.join(',')})`;
      },
    }),
    [configSteps(state)],
  );
});

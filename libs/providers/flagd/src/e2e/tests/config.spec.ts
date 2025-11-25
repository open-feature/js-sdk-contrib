import { configSteps } from '../step-definitions/configSteps';
import type { State } from '../step-definitions/state';
import { autoBindSteps, loadFeatures } from 'jest-cucumber';
import { CONFIG_FEATURE } from '../constants';

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
        const tags = [...vars.scenarioTags, ...vars.featureTags];
        return `${vars.scenarioTitle}${tags.length > 0 ? ` (${tags.join(', ')})` : ''}`;
      },
    }),
    [configSteps(state)],
  );
});

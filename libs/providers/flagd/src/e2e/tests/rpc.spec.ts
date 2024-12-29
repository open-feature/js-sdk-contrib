import { autoBindSteps, loadFeatures } from 'jest-cucumber';
import { GHERKIN_FLAGD } from '../constants';
import { providerSteps } from '../step-definitions/providerSteps';
import { configSteps } from '../step-definitions/configSteps';
import { State } from '../step-definitions/state';
import { eventSteps } from '../step-definitions/eventSteps';
import { flagSteps } from '../step-definitions/flagSteps';
import { contextSteps } from '../step-definitions/contextSteps';

const steps = [providerSteps, configSteps, eventSteps, flagSteps, contextSteps];

describe('rpc', () => {
  const state: State = {
    resolverType: 'rpc',
    options: {},
    config: undefined,
    events: [],
  };
  autoBindSteps(
    loadFeatures(GHERKIN_FLAGD, {
      tagFilter: '@rpc and not @targetURI and not @customCert and not @events and not @sync  and not @offline',
      scenarioNameTemplate: (vars) => {
        return `${vars.scenarioTitle} (${vars.scenarioTags.join(',')} ${vars.featureTags.join(',')})`;
      },
    }),
    steps.map((step) => step(state)),
  );
});

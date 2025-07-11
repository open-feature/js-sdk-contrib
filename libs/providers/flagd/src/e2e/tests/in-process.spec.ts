import { autoBindSteps, loadFeatures } from 'jest-cucumber';
import { GHERKIN_FLAGD } from '../constants';
import { providerSteps } from '../step-definitions/providerSteps';
import { configSteps } from '../step-definitions/configSteps';
import type { State } from '../step-definitions/state';
import { eventSteps } from '../step-definitions/eventSteps';
import { flagSteps } from '../step-definitions/flagSteps';
import { contextSteps } from '../step-definitions/contextSteps';

const steps = [providerSteps, configSteps, eventSteps, flagSteps, contextSteps];

jest.setTimeout(50000);
describe('in-process', () => {
  const state: State = {
    resolverType: 'in-process',
    options: {},
    config: undefined,
    events: [],
  };
  autoBindSteps(
    loadFeatures(GHERKIN_FLAGD, {
      // remove filters as we add support for features
      // see: https://github.com/open-feature/js-sdk-contrib/issues/1096 and child issues
      tagFilter:
        '@in-process and not @targetURI and not @customCert and not @events and not @sync and not @grace and not @metadata and not @contextEnrichment',
      scenarioNameTemplate: (vars) => {
        return `${vars.scenarioTitle} (${vars.scenarioTags.join(',')} ${vars.featureTags.join(',')})`;
      },
    }),
    steps.map((step) => step(state)),
  );
});

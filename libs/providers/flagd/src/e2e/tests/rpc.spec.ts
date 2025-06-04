import { autoBindSteps, loadFeatures } from 'jest-cucumber';
import { providerSteps } from '../step-definitions/providerSteps';
import { configSteps } from '../step-definitions/configSteps';
import type { State } from '../step-definitions/state';
import { eventSteps } from '../step-definitions/eventSteps';
import { flagSteps } from '../step-definitions/flagSteps';
import { contextSteps } from '../step-definitions/contextSteps';
import { GHERKIN_FLAGD } from '../constants';

const steps = [providerSteps, configSteps, eventSteps, flagSteps, contextSteps];

jest.setTimeout(50000);

describe('rpc', () => {
  const state: State = {
    resolverType: 'rpc',
    options: {},
    config: undefined,
    events: [],
  };
  autoBindSteps(
    loadFeatures(GHERKIN_FLAGD, {
      tagFilter:
        // remove filters as we add support for features
        // see: https://github.com/open-feature/js-sdk-contrib/issues/1096 and child issues
        '@rpc and not @targetURI and not @customCert and not @events and not @stream and not @grace and not @metadata and not @contextEnrichment and not @caching',
      scenarioNameTemplate: (vars) => {
        return `${vars.scenarioTitle} (${vars.scenarioTags.join(',')} ${vars.featureTags.join(',')})`;
      },
    }),
    steps.map((step) => step(state)),
  );
});

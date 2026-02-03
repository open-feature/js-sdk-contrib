import type { StepsDefinitionCallbackOptions } from 'jest-cucumber/dist/src/feature-definition-creation';
import type { State, Steps } from './state';
import { CacheOption, getConfig, ResolverType } from '../../lib/configuration';
import { mapValueToType } from './utils';
import { ClientProviderStatus } from '@openfeature/core';

export const clientSteps: Steps = (state: State) => {
  return ({ given, when, then, and }: StepsDefinitionCallbackOptions) => {
    and('the client is in fatal state', () => {
      expect(state.client?.providerStatus).toBe(ClientProviderStatus.ERROR);
    });
  };
};

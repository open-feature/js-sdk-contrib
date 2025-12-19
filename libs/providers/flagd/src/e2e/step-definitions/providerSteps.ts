import { OpenFeature, ProviderStatus } from '@openfeature/server-sdk';
import { FlagdComposeContainer } from '../tests/flagdComposeContainer';
import type { State, Steps } from './state';
import { FlagdProvider } from '../../lib/flagd-provider';
import type { FlagdProviderOptions } from '../../lib/configuration';
import { getGherkinTestPath } from '@openfeature/flagd-core';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

export const providerSteps: Steps =
  (state: State) =>
  ({ given, when, then }) => {
    const container: FlagdComposeContainer = FlagdComposeContainer.build();
    beforeAll(async () => {
      console.log('Setting test harness...');
      return await container.start();
    }, 50000);

    afterAll(async () => {
      console.log('Stopping test harness...');
      await container.stop();
    });

    beforeEach(async () => {
      await OpenFeature.clearProviders();
    });

    afterEach(async () => {
      await OpenFeature.close();
      await fetch('http://' + container.getLaunchpadUrl() + '/stop');
    }, 50000);

    given(/a (.*) flagd provider/, async (providerType: string) => {
      const flagdOptions: FlagdProviderOptions = {
        resolverType: state.resolverType,
        retryGracePeriod: 2, // retryGracePeriod is related to test expectations; this must be 2
        // these options are optimized for test speed and stability
        deadlineMs: 15000,
        keepAliveTime: 200,
        retryBackoffMaxMs: 1000,
        retryBackoffMs: 100,

        ...state.config,
        ...state.options,
      };

      let type = 'default';
      switch (providerType) {
        case 'unavailable':
          flagdOptions['port'] = 9999;
          break;
        case 'forbidden':
          flagdOptions['port'] = container.getForbiddenPort();
          break;
        case 'ssl': {
          flagdOptions['port'] = container.getPort(state.resolverType);
          flagdOptions['tls'] = true;
          const certPath = resolve(getGherkinTestPath('custom-root-cert.crt', 'test-harness/ssl/'));
          flagdOptions['certPath'] = certPath;
          if (!existsSync(certPath)) {
            throw new Error('Certificate file not found at path: ' + certPath);
          }
          if (state?.config?.selector) {
            flagdOptions['selector'] = state.config.selector;
          }
          type = 'ssl';
          break;
        }
        case 'stable':
          flagdOptions['port'] = container.getPort(state.resolverType);
          break;
        case 'syncpayload':
          flagdOptions['port'] = container.getPort(state.resolverType);
          type = 'sync-payload';
          break;
        case 'metadata': 
          flagdOptions['port'] = container.getPort(state.resolverType);
          type = 'metadata';
          break;
        default:
          throw new Error('unknown provider type: ' + providerType);
      }

      await fetch('http://' + container.getLaunchpadUrl() + '/start?config=' + type);
      if (providerType == 'unavailable' || providerType == 'forbidden') {
        OpenFeature.setProvider(providerType, new FlagdProvider(flagdOptions));
      } else {
        await OpenFeature.setProviderAndWait(providerType, new FlagdProvider(flagdOptions));
      }

      state.client = OpenFeature.getClient(providerType);
      state.providerType = providerType;
    });

    function mapProviderState(state: string): ProviderStatus {
      const mappedState = state.toUpperCase().replace('-', '_');
      const status = Object.values(ProviderStatus).find((s) => s === mappedState);

      if (!status) {
        throw new Error(`Unknown provider status: ${state}`);
      }

      return status;
    }

    then(/^the client should be in (.*) state/, (providerState: string) => {
      expect(state.client?.providerStatus).toBe(mapProviderState(providerState));
    });

    when(/^the connection is lost for (\d+)s$/, async (time) => {
      console.log('Restarting flagd...');
      await fetch('http://' + container.getLaunchpadUrl() + '/restart?seconds=' + time);
    });

    when('the flag was modified', async () => {
      await fetch('http://' + container.getLaunchpadUrl() + '/change');
    });
  };

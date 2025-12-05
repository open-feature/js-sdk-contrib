import { ProviderStatus } from '@openfeature/server-sdk';
import { OpenFeature } from '@openfeature/server-sdk';
import { FlagdContainer } from '../tests/flagdContainer';
import type { State, Steps } from './state';
import { FlagdProvider } from '../../lib/flagd-provider';
import type { FlagdProviderOptions } from '../../lib/configuration';
import { getGherkinTestPath } from '@openfeature/flagd-core';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

export const providerSteps: Steps =
  (state: State) =>
  ({ given, when, then, and }) => {
    const container: FlagdContainer = FlagdContainer.build();
    beforeAll(async () => {
      console.log('Setting flagd provider...');

      return await container.start();
    }, 50000);

    afterAll(async () => {
      await OpenFeature.close();
      await container.stop();
    });

    afterEach(async () => {
      // everything breaks without this
      await OpenFeature.close();
      if (state.client) {
        await fetch('http://' + container.getLaunchpadUrl() + '/stop');
        await new Promise((r) => setTimeout(r, 100));
      }
      return Promise.resolve();
    }, 50000);

    given(/a (.*) flagd provider/, async (providerType: string) => {
      const flagdOptions: FlagdProviderOptions = {
        resolverType: state.resolverType,
        deadlineMs: 2000,
        ...state.config,
        ...state.options,
      };

      let type = 'default';
      switch (providerType) {
        case 'unavailable':
          flagdOptions['port'] = 9999;
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
        default:
          throw new Error('unknown provider type: ' + providerType);
      }

      await fetch('http://' + container.getLaunchpadUrl() + '/start?config=' + type);
      await new Promise((r) => setTimeout(r, 50));
      if (providerType == 'unavailable') {
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
      console.log('stopping flagd');
      await fetch('http://' + container.getLaunchpadUrl() + '/restart?seconds=' + time);
    });

    when('the flag was modified', async () => {
      await fetch('http://' + container.getLaunchpadUrl() + '/change');
    });
  };

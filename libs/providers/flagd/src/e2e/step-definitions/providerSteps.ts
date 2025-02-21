import { OpenFeature } from '@openfeature/server-sdk';
import { FlagdContainer } from '../tests/flagdContainer';
import { State, Steps } from './state';
import { FlagdProvider } from '../../lib/flagd-provider';
import { waitFor } from "./utils";

export const providerSteps: Steps =
  (state: State) =>
  ({ given, when, then }) => {
    const container: FlagdContainer = FlagdContainer.build();
    beforeAll(async () => {
      console.log('Setting flagd provider...');

      return container.start();
    }, 50000);

    afterAll(async () => {
      await OpenFeature.close();
      await container.stop();
    });

    beforeEach(async () => {
      if (container.isStarted()) {
        return container.start();
      }
      return Promise.resolve();
    }, 50000);
    afterEach(async () => {
      if (state.client) {
        await fetch('http://' + container.getLaunchpadUrl() + '/stop');
        await new Promise((r) => setTimeout(r, 100));
      }
      return Promise.resolve();
    }, 50000);

    given(/a (.*) flagd provider/, async (providerType: string) => {
      const flagdOptions: Record<string, unknown> = {
        resolverType: state.resolverType,
        deadlineMs: 2000,
      };
      let type = 'default';
      switch (providerType) {
        default:
          flagdOptions['port'] = container.getPort(state.resolverType);
          break;
        case 'unavailable':
          flagdOptions['port'] = 9999;
          break;
        case 'ssl':
          // todo: configure properly
          flagdOptions['port'] = container.getPort(state.resolverType);
          type = 'ssl';
          break;
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

    when(/^the connection is lost for (\d+)s$/, async (time) => {
      console.log('stopping flagd');
      await fetch('http://' + container.getLaunchpadUrl() + '/restart?seconds=' + time);
      await new Promise((r) => setTimeout(r, 50));
    });

    when('the flag was modified', async () => {
      await fetch('http://' + container.getLaunchpadUrl() + '/change');
      await new Promise((r) => setTimeout(r, 50));
    });
  };

import { OpenFeature } from '@openfeature/server-sdk';
import { FlagdContainer } from '../tests/flagdContainer';
import { State, Steps } from './state';
import { FlagdProvider } from '../../lib/flagd-provider';

type Containers = Record<string, FlagdContainer> & { default: FlagdContainer };

export const providerSteps: Steps =
  (state: State) =>
  ({ given, when, then }) => {
    const containers: Containers = {
      default: FlagdContainer.build(),
    };
    beforeAll(async () => {
      console.log('Setting flagd provider...');

      const promises = [];

      for (const container of Object.values(containers)) {
        promises.push(container.start());
      }

      return Promise.all(promises);
    });

    afterAll(async () => {
      await OpenFeature.close();
      for (const container of Object.values(containers)) {
        await container.stop();
      }
    });

    beforeEach(async () => {
      const promises = [];

      for (const container of Object.values(containers)) {
        promises.push(container.start());
      }

      return Promise.all(promises);
    });

    function getContainer(providerType: string): FlagdContainer {
      if (Object.hasOwn(containers, providerType)) {
        return containers[providerType];
      }
      return containers.default;
    }

    given(/a (.*) flagd provider/, async (providerType: string) => {
      const container = getContainer(providerType);
      const flagdOptions: Record<string, unknown> = {
        resolverType: state.resolverType,
      };
      switch (providerType) {
        default:
          flagdOptions['port'] = container.getPort(state.resolverType);
          break;
        case 'unavailable':
          flagdOptions['port'] = 9999;
          break;
      }
      if (providerType == 'unavailable') {
        OpenFeature.setProvider(providerType, new FlagdProvider(flagdOptions));
      } else {
        await OpenFeature.setProviderAndWait(providerType, new FlagdProvider(flagdOptions));
      }

      state.client = OpenFeature.getClient(providerType);
      state.providerType = providerType;
    });

    when(/^the connection is lost for (\d+)s$/, async (time) => {
      const container = getContainer(state.providerType!);
      await container.stop();
      setTimeout(() => container.start(), time * 1000);
    });
  };

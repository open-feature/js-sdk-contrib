import { OfrepWebProvider } from './ofrep-web-provider';
import TestLogger from './test-logger';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { server } from '../../../../shared/ofrep-core/src/test/mock-service-worker';
import { ClientProviderEvents, ClientProviderStatus, OpenFeature } from '@openfeature/web-sdk';

describe('OFREPWebProvider', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  const defaultContext = {
    targetingKey: '21640825-95e7-4335-b149-bd6881cf7875',
    errors: {
      // 403: true,
    },
  };

  it('xxx', async () => {
    const providerName = expect.getState().currentTestName || 'test-provider';
    const provider = new OfrepWebProvider({ baseUrl: 'https://localhost:8080', pollInterval: 100 }, new TestLogger());

    await OpenFeature.setContext(defaultContext);
    await OpenFeature.setProviderAndWait(providerName, provider);
    const client = OpenFeature.getClient(providerName);

    client.addHandler(ClientProviderEvents.Ready, (xxx) => {
      console.log(`ready: ${JSON.stringify(xxx)}`);
    });

    client.addHandler(ClientProviderEvents.Error, (xxx) => {
      console.log(`error: ${JSON.stringify(xxx)}`);
    });

    client.addHandler(ClientProviderEvents.Stale, (xxx) => {
      console.log(`stale: ${JSON.stringify(xxx)}`);
    });

    client.addHandler(ClientProviderEvents.Reconciling, (xxx) => {
      console.log(`Reconciling: ${JSON.stringify(xxx)}`);
    });

    client.addHandler(ClientProviderEvents.ContextChanged, (xxx) => {
      console.log(`ContextChanged: ${JSON.stringify(xxx)}`);
    });

    client.addHandler(ClientProviderEvents.ConfigurationChanged, (xxx) => {
      console.log(`ConfigurationChanged: ${JSON.stringify(xxx)}`);
    });

    console.log(client.getBooleanDetails('bool-flag', true));

    console.log('status:', client.providerStatus);

    await OpenFeature.setContext({
      ...defaultContext,
      errors: {
        403: true,
      },
    });

    console.log('status:', client.providerStatus);

    console.log(client.getBooleanDetails('bool-flag', false));

    await new Promise((resolve) => setTimeout(resolve, 1000));
    await OpenFeature.setContext({
      ...defaultContext,
      email: 'john.doe@goff.org',
    });
    await OpenFeature.close();
    await new Promise((resolve) => setTimeout(resolve, 3000));
  });
});

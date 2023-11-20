import { OpenFeature, ProviderEvents } from '@openfeature/server-sdk';
import { defineFeature, loadFeature } from 'jest-cucumber';

jest.setTimeout(30000);

// load the feature file.
const feature = loadFeature('features/flagd-reconnect.feature');

// get a client (flagd provider registered in setup)
const client = OpenFeature.getClient('unstable');

defineFeature(feature, (test) => {
  let readyRunCount = 0;
  let errorRunCount = 0;

  beforeAll((done) => {
    client.addHandler(ProviderEvents.Ready, async () => {
      readyRunCount++;
      done();
    });
  });

  test('Provider reconnection', ({ given, when, then, and }) => {
    given('a flagd provider is set', () => {
      // handled in beforeAll
    });
    when('a PROVIDER_READY handler and a PROVIDER_ERROR handler are added', () => {
      client.addHandler(ProviderEvents.Error, () => {
        errorRunCount++;
      });
    });
    then('the PROVIDER_READY handler must run when the provider connects', async () => {
      // should already be at 1 from `beforeAll`
      expect(readyRunCount).toEqual(1);
    });
    and("the PROVIDER_ERROR handler must run when the provider's connection is lost", async () => {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      expect(errorRunCount).toBeGreaterThan(0);
    });
    and('when the connection is reestablished the PROVIDER_READY handler must run again', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      expect(readyRunCount).toBeGreaterThan(1);
    });
  });
});

import { OpenFeature, ProviderEvents } from '@openfeature/server-sdk';
import { defineFeature, loadFeature } from 'jest-cucumber';
import { UNAVAILABLE_CLIENT_NAME, UNSTABLE_CLIENT_NAME } from '../constants';

jest.setTimeout(30000);

export function flagdRecconnectUnstable() {
  // load the feature file.
  const feature = loadFeature('features/flagd-reconnect.feature');

  // get a client (flagd provider registered in setup)
  const client = OpenFeature.getClient(UNSTABLE_CLIENT_NAME);

  defineFeature(feature, (test) => {
    let readyRunCount = 0;
    let errorRunCount = 0;

    beforeAll((done) => {
      client.addHandler(ProviderEvents.Ready, async () => {
        readyRunCount++;
        done();
      });
    });

    describe('retry', () => {
      /**
       * This describe block and retry settings are calibrated to gRPC's retry time
       * and our testing container's restart cadence.
       */
      const retryTimes = 240;
      const retryDelayMs = 1000;
      jest.retryTimes(retryTimes);

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
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
          expect(errorRunCount).toBeGreaterThan(0);
        });
        and('when the connection is reestablished the PROVIDER_READY handler must run again', async () => {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
          expect(readyRunCount).toBeGreaterThan(1);
        });
      });
    });

    test('Provider unavailable', ({ given, when, then }) => {
      let errorHandlerRun = 0;

      given('flagd is unavailable', async () => {
        // handled in setup
      });

      when('a flagd provider is set and initialization is awaited', () => {
        OpenFeature.getClient(UNAVAILABLE_CLIENT_NAME).addHandler(ProviderEvents.Error, () => {
          errorHandlerRun++;
        });
      });

      then('an error should be indicated within the configured deadline', () => {
        expect(errorHandlerRun).toBeGreaterThan(0);
      });
    });
  });
}

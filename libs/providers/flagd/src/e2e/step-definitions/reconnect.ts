import { StepDefinitions } from 'jest-cucumber';
import { OpenFeature, ProviderEvents } from '@openfeature/server-sdk';
import { UNAVAILABLE_CLIENT_NAME, UNSTABLE_CLIENT_NAME } from '../constants';

export const reconnectStepDefinitions: StepDefinitions = ({ given, and, when, then }) => {
  const client = OpenFeature.getClient(UNSTABLE_CLIENT_NAME);

  given('a flagd provider is set', () => undefined);
  given('flagd is unavailable', () => undefined);

  let errorRunCount = 0;
  let readyRunCount = 0;
  let errorHandlerRun = 0;

  /**
   * This describe block and retry settings are calibrated to gRPC's retry time
   * and our testing container's restart cadence.
   */
  const retryTimes = 240;
  jest.retryTimes(retryTimes);
  const retryDelayMs = 5000;

  beforeAll((done) => {
    client.addHandler(ProviderEvents.Ready, () => {
      readyRunCount++;
      done();
    });
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
  when('a flagd provider is set and initialization is awaited', () => {
    OpenFeature.getClient(UNAVAILABLE_CLIENT_NAME).addHandler(ProviderEvents.Error, () => {
      errorHandlerRun++;
    });
  });

  then('an error should be indicated within the configured deadline', () => {
    expect(errorHandlerRun).toBeGreaterThan(0);
  });
};

export default reconnectStepDefinitions;

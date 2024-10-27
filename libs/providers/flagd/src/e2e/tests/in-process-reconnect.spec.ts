import assert from 'assert';
import { OpenFeature } from '@openfeature/server-sdk';
import { FlagdProvider } from '../../lib/flagd-provider';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { autoBindSteps, loadFeature } from 'jest-cucumber';
import {
  UNSTABLE_CLIENT_NAME,
  UNAVAILABLE_CLIENT_NAME,
  FLAGD_NAME,
  GHERKIN_FLAGD_RECONNECT_FEATURE,
  IMAGE_VERSION,
} from '../constants';
import { reconnectStepDefinitions } from '../step-definitions';

// register the flagd provider before the tests.
async function setup() {
  const containers: StartedTestContainer[] = [];

  console.log('Setting flagd provider...');
  const unstable = await new GenericContainer(`ghcr.io/open-feature/sync-testbed-unstable:${IMAGE_VERSION}`)
    .withExposedPorts(9090)
    .start();
  containers.push(unstable);
  OpenFeature.setProvider(
    UNSTABLE_CLIENT_NAME,
    new FlagdProvider({ resolverType: 'in-process', host: 'localhost', port: unstable.getFirstMappedPort() }),
  );

  OpenFeature.setProvider(
    UNAVAILABLE_CLIENT_NAME,
    new FlagdProvider({ resolverType: 'in-process', host: 'localhost', port: 9092 }),
  );
  assert(
    OpenFeature.getProviderMetadata(UNSTABLE_CLIENT_NAME).name === FLAGD_NAME,
    new Error(
      `Expected ${FLAGD_NAME} provider to be configured, instead got: ${
        OpenFeature.getProviderMetadata(UNSTABLE_CLIENT_NAME).name
      }`,
    ),
  );
  assert(
    OpenFeature.getProviderMetadata(UNAVAILABLE_CLIENT_NAME).name === FLAGD_NAME,
    new Error(
      `Expected ${FLAGD_NAME} provider to be configured, instead got: ${
        OpenFeature.getProviderMetadata(UNAVAILABLE_CLIENT_NAME).name
      }`,
    ),
  );

  console.log('flagd provider configured!');
  return containers;
}

jest.setTimeout(30000);
describe('in process', () => {
  let containers: StartedTestContainer[] = [];
  beforeAll(async () => {
    containers = await setup();
  }, 60000);
  afterAll(async () => {
    await OpenFeature.close();
    for (const container of containers) {
      await container.stop();
    }
  });
  const features = [loadFeature(GHERKIN_FLAGD_RECONNECT_FEATURE)];
  autoBindSteps(features, [reconnectStepDefinitions]);
});

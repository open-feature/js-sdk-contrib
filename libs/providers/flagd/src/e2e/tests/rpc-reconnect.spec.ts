import assert from 'assert';
import { OpenFeature } from '@openfeature/server-sdk';
import { FlagdProvider } from '../../lib/flagd-provider';
import type { StartedTestContainer } from 'testcontainers';
import { GenericContainer } from 'testcontainers';
import { autoBindSteps, loadFeature } from 'jest-cucumber';
import {
  FLAGD_NAME,
  GHERKIN_FLAGD_RECONNECT_FEATURE,
  UNAVAILABLE_CLIENT_NAME,
  UNSTABLE_CLIENT_NAME,
} from '../constants';
import { reconnectStepDefinitions } from '../step-definitions';
import { IMAGE_VERSION } from '@openfeature/flagd-core';

// register the flagd provider before the tests.
async function setup() {
  const containers: StartedTestContainer[] = [];

  console.log('Setting flagd provider...');
  const unstable = await new GenericContainer(`ghcr.io/open-feature/flagd-testbed-unstable:${IMAGE_VERSION}`)
    .withExposedPorts(8013)
    .start();
  containers.push(unstable);
  OpenFeature.setProvider(
    UNSTABLE_CLIENT_NAME,
    new FlagdProvider({ cache: 'disabled', port: unstable.getFirstMappedPort() }),
  );
  OpenFeature.setProvider(UNAVAILABLE_CLIENT_NAME, new FlagdProvider({ cache: 'disabled', port: 8015 }));
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
describe('rpc', () => {
  let containers: StartedTestContainer[] = [];
  beforeAll(async () => {
    containers = await setup();
  }, 60000);
  afterAll(async () => {
    await OpenFeature.close();
    for (const container of containers) {
      try {
        await container.stop();
      } catch {
        console.warn(`Failed to stop container ${container.getName()}`);
      }
    }
  });

  const features = [loadFeature(GHERKIN_FLAGD_RECONNECT_FEATURE)];
  autoBindSteps(features, [reconnectStepDefinitions]);
});

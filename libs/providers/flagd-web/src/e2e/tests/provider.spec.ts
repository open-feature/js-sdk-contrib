import assert from 'assert';
import { Client, OpenFeature } from '@openfeature/web-sdk';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { FlagdWebProvider } from '../../lib/flagd-web-provider';
import { autoBindSteps, loadFeature } from 'jest-cucumber';
import {
  E2E_CLIENT_NAME,
  flagStepDefinitions,
  GHERKIN_EVALUATION_FEATURE,
  IMAGE_VERSION,
} from '@openfeature/flagd-core';

// register the flagd provider before the tests.
async function setup() {
  const containers: StartedTestContainer[] = [];

  console.log('Setting flagd provider...');

  const stable = await new GenericContainer(`ghcr.io/open-feature/flagd-testbed:${IMAGE_VERSION}`)
    .withExposedPorts(8013)
    .start();
  containers.push(stable);
  OpenFeature.setProvider(
    E2E_CLIENT_NAME,
    new FlagdWebProvider({
      host: stable.getHost(),
      port: stable.getMappedPort(8013),
      tls: false,
      maxRetries: -1,
    }),
  );
  assert(
    OpenFeature.getProviderMetadata(E2E_CLIENT_NAME).name === E2E_CLIENT_NAME,
    new Error(
      `Expected ${E2E_CLIENT_NAME} provider to be configured, instead got: ${OpenFeature.providerMetadata.name}`,
    ),
  );
  console.log('flagd provider configured!');
  return containers;
}

describe('web provider', () => {
  let containers: StartedTestContainer[] = [];
  beforeAll(async () => {
    containers = await setup();
  }, 60000);
  afterAll(async () => {
    await OpenFeature.close();
    for (const container of containers) {
      container.stop();
    }
  });

  const features = [loadFeature(GHERKIN_EVALUATION_FEATURE)];
  autoBindSteps(features, [flagStepDefinitions]);
});

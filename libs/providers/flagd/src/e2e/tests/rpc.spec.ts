import assert from 'assert';
import { OpenFeature } from '@openfeature/server-sdk';
import { FlagdProvider } from '../../lib/flagd-provider';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { autoBindSteps, loadFeature } from 'jest-cucumber';
import {
  FLAGD_NAME,
  GHERKIN_EVALUATION_FEATURE,
  GHERKIN_FLAGD_FEATURE,
  GHERKIN_FLAGD_JSON_EVALUATOR_FEATURE,
} from '../constants';
import { E2E_CLIENT_NAME, IMAGE_VERSION } from '@openfeature/flagd-core';
import { flagStepDefinitions } from '../step-definitions';

// register the flagd provider before the tests.
async function setup() {
  const containers: StartedTestContainer[] = [];

  console.log('Setting flagd provider...');
  const stable = await new GenericContainer(`ghcr.io/open-feature/flagd-testbed:${IMAGE_VERSION}`)
    .withExposedPorts(8013)
    .start();
  containers.push(stable);
  OpenFeature.setProvider(E2E_CLIENT_NAME, new FlagdProvider({ cache: 'disabled', port: stable.getFirstMappedPort() }));

  assert(
    OpenFeature.getProviderMetadata(E2E_CLIENT_NAME).name === FLAGD_NAME,
    new Error(
      `Expected ${FLAGD_NAME} provider to be configured, instead got: ${
        OpenFeature.getProviderMetadata(E2E_CLIENT_NAME).name
      }`,
    ),
  );

  console.log('flagd provider configured!');
  return containers;
}

describe('rpc', () => {
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
  const features = [
    loadFeature(GHERKIN_FLAGD_FEATURE),
    loadFeature(GHERKIN_EVALUATION_FEATURE),
    loadFeature(GHERKIN_FLAGD_JSON_EVALUATOR_FEATURE),
  ];
  autoBindSteps(features, [flagStepDefinitions]);
});

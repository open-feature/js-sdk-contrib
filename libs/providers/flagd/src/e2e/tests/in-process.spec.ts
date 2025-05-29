import assert from 'assert';
import { OpenFeature } from '@openfeature/server-sdk';
import { FlagdProvider } from '../../lib/flagd-provider';
import type { StartedTestContainer } from 'testcontainers';
import { GenericContainer } from 'testcontainers';
import { autoBindSteps, loadFeature } from 'jest-cucumber';
import {
  FLAGD_NAME,
  GHERKIN_EVALUATION_FEATURE,
  GHERKIN_FLAGD_FEATURE,
  GHERKIN_FLAGD_JSON_EVALUATOR_FEATURE,
} from '../constants';
import { flagStepDefinitions } from '../step-definitions';
import { E2E_CLIENT_NAME, IMAGE_VERSION } from '@openfeature/flagd-core';

// register the flagd provider before the tests.
async function setup() {
  const containers: StartedTestContainer[] = [];

  console.log('Setting flagd provider...');

  const stable = await new GenericContainer(`ghcr.io/open-feature/flagd-testbed:${IMAGE_VERSION}`)
    .withExposedPorts(8015)
    .start();
  containers.push(stable);
  OpenFeature.setProvider(
    E2E_CLIENT_NAME,
    new FlagdProvider({ resolverType: 'in-process', host: 'localhost', port: stable.getFirstMappedPort() }),
  );

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
  const features = [
    loadFeature(GHERKIN_FLAGD_FEATURE),
    loadFeature(GHERKIN_EVALUATION_FEATURE),
    loadFeature(GHERKIN_FLAGD_JSON_EVALUATOR_FEATURE),
  ];
  autoBindSteps(features, [flagStepDefinitions]);
});

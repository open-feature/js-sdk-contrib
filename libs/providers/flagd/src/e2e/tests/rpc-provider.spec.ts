import assert from 'assert';
import { OpenFeature } from '@openfeature/server-sdk';
import { FlagdProvider } from '../../lib/flagd-provider';
import {
  E2E_CLIENT_NAME,
  FLAGD_NAME,
  UNSTABLE_CLIENT_NAME,
  UNAVAILABLE_CLIENT_NAME,
  IMAGE_VERSION,
} from '../constants';
import { evaluation } from '../step-definitions/evaluation';
import { GenericContainer, StartedTestContainer, TestContainer } from 'testcontainers';
import { flagd } from '../step-definitions/flagd';
import { flagdJsonEvaluator } from '../step-definitions/flagd-json-evaluator';
import { flagdRecconnectUnstable } from '../step-definitions/flagd-reconnect.unstable';

// register the flagd provider before the tests.
async function setup() {
  const containers: StartedTestContainer[] = [];

  console.log('Setting flagd provider...');

  const stable = await new GenericContainer(`ghcr.io/open-feature/flagd-testbed:${IMAGE_VERSION}`)
    .withExposedPorts(8013)
    .start();
  containers.push(stable);
  OpenFeature.setProvider(E2E_CLIENT_NAME, new FlagdProvider({ cache: 'disabled', port: stable.getFirstMappedPort() }));

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
    OpenFeature.getProviderMetadata(E2E_CLIENT_NAME).name === FLAGD_NAME,
    new Error(
      `Expected ${FLAGD_NAME} provider to be configured, instead got: ${
        OpenFeature.getProviderMetadata(E2E_CLIENT_NAME).name
      }`,
    ),
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
  evaluation();
  flagd();
  flagdJsonEvaluator();
  flagdRecconnectUnstable();
});

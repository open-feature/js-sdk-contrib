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

  const stable = await new GenericContainer(`ghcr.io/open-feature/sync-testbed:${IMAGE_VERSION}`)
    .withExposedPorts(9090)
    .start();
  containers.push(stable);
  OpenFeature.setProvider(
    E2E_CLIENT_NAME,
    new FlagdProvider({ resolverType: 'in-process', host: 'localhost', port: stable.getFirstMappedPort() }),
  );

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

describe('in process', () => {
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
  evaluation();
  flagd();
  flagdJsonEvaluator();
  flagdRecconnectUnstable();
});

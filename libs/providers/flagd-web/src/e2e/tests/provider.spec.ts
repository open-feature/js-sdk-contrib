import assert from 'assert';
import { OpenFeature } from '@openfeature/web-sdk';
import { FLAGD_NAME, IMAGE_VERSION } from '../constants';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { FlagdWebProvider } from '../../lib/flagd-web-provider';
import { evaluation } from '../step-definitions/evaluation';

// register the flagd provider before the tests.
async function setup() {
  const containers: StartedTestContainer[] = [];

  console.log('Setting flagd provider...');

  const stable = await new GenericContainer(`ghcr.io/open-feature/flagd-testbed:${IMAGE_VERSION}`)
    .withExposedPorts(8013)
    .start();
  containers.push(stable);
  OpenFeature.setProvider(
    new FlagdWebProvider({
      host: stable.getHost(),
      port: stable.getMappedPort(8013),
      tls: false,
      maxRetries: -1,
    }),
  );
  assert(
    OpenFeature.providerMetadata.name === FLAGD_NAME,
    new Error(`Expected ${FLAGD_NAME} provider to be configured, instead got: ${OpenFeature.providerMetadata.name}`),
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
  evaluation();
});

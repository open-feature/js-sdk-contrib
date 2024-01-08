import assert from 'assert';
import { OpenFeature } from '@openfeature/server-sdk';
import { FlagdProvider } from '../lib/flagd-provider';

const FLAGD_NAME = 'flagd Provider';
const E2E_CLIENT_NAME = 'e2e';
const UNSTABLE_CLIENT_NAME = 'unstable';

// register the flagd provider before the tests.
console.log('Setting flagd provider...');
OpenFeature.setProvider(
  E2E_CLIENT_NAME,
  new FlagdProvider({ cache: 'disabled', resolverType: 'in-process', host: 'localhost', port: 9090 }),
);
OpenFeature.setProvider(
  UNSTABLE_CLIENT_NAME,
  new FlagdProvider({ resolverType: 'in-process', host: 'localhost', port: 9091 }),
);
assert(
  OpenFeature.getProviderMetadata(E2E_CLIENT_NAME).name === FLAGD_NAME,
  new Error(`Expected ${FLAGD_NAME} provider to be configured, instead got: ${OpenFeature.providerMetadata.name}`),
);
assert(
  OpenFeature.getProviderMetadata(UNSTABLE_CLIENT_NAME).name === FLAGD_NAME,
  new Error(`Expected ${FLAGD_NAME} provider to be configured, instead got: ${OpenFeature.providerMetadata.name}`),
);
console.log('flagd provider configured!');

import assert from 'assert';
import { OpenFeature } from '@openfeature/server-sdk';
import { FlagdProvider } from '../lib/flagd-provider';
import { E2E_CLIENT_NAME, FLAGD_NAME, UNSTABLE_CLIENT_NAME, UNAVAILABLE_CLIENT_NAME } from './constants';

// register the flagd provider before the tests.
console.log('Setting flagd provider...');
OpenFeature.setProvider(
  E2E_CLIENT_NAME,
  new FlagdProvider({ resolverType: 'in-process', host: 'localhost', port: 9090 }),
);
OpenFeature.setProvider(
  UNSTABLE_CLIENT_NAME,
  new FlagdProvider({ resolverType: 'in-process', host: 'localhost', port: 9091 }),
);
OpenFeature.setProvider(
  UNAVAILABLE_CLIENT_NAME,
  new FlagdProvider({ resolverType: 'in-process', host: 'localhost', port: 9092 }),
);
assert(
  OpenFeature.getProviderMetadata(E2E_CLIENT_NAME).name === FLAGD_NAME,
  new Error(`Expected ${FLAGD_NAME} provider to be configured, instead got: ${OpenFeature.getProviderMetadata(E2E_CLIENT_NAME).name}`),
);
assert(
  OpenFeature.getProviderMetadata(UNSTABLE_CLIENT_NAME).name === FLAGD_NAME,
  new Error(`Expected ${FLAGD_NAME} provider to be configured, instead got: ${OpenFeature.getProviderMetadata(UNSTABLE_CLIENT_NAME).name}`),
);
assert(
  OpenFeature.getProviderMetadata(UNAVAILABLE_CLIENT_NAME).name === FLAGD_NAME,
  new Error(`Expected ${FLAGD_NAME} provider to be configured, instead got: ${OpenFeature.getProviderMetadata(UNAVAILABLE_CLIENT_NAME).name}`),
);
console.log('flagd provider configured!');

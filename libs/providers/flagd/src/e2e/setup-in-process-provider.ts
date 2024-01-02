import assert from 'assert';
import { OpenFeature } from '@openfeature/server-sdk';
import { FlagdProvider } from '../lib/flagd-provider';

const FLAGD_NAME = 'flagd Provider';

// register the flagd provider before the tests.
console.log('Setting flagd provider...');
OpenFeature.setProvider(
  'e2e',
  new FlagdProvider({ cache: 'disabled', resolverType: 'in-process', host: 'localhost', port: 9090 }),
);
OpenFeature.setProvider('unstable', new FlagdProvider({ resolverType: 'in-process', host: 'localhost', port: 9091 }));
assert(
  OpenFeature.providerMetadata.name === FLAGD_NAME,
  new Error(`Expected ${FLAGD_NAME} provider to be configured, instead got: ${OpenFeature.providerMetadata.name}`),
);
console.log('flagd provider configured!');

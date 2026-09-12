import type { Config } from 'jest';

const config: Config = {
  displayName: 'providers-flagd-e2e',
  clearMocks: true,
  preset: 'ts-jest',
  moduleNameMapper: {
    '@openfeature/flagd-core': ['<rootDir>/../../../../shared/flagd-core/src'],
    '@openfeature/tck': ['<rootDir>/../../../../shared/tck/src'],
    '(.+)\\.js$': '$1',
  },
  verbose: true,
};

module.exports = config;

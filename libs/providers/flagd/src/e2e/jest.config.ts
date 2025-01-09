import type { Config } from 'jest';

const config: Config = {
  displayName: 'providers-flagd-e2e',
  clearMocks: true,
  preset: 'ts-jest',
  moduleNameMapper: {
    '@openfeature/flagd-core': ['<rootDir>/../../../../shared/flagd-core/src'],
    '(.+)\\.js$': '$1',
  },
  detectOpenHandles: true,
  verbose: true,
};

export default config;

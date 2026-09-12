import type { Config } from 'jest';

const config: Config = {
  displayName: 'providers-flagd-e2e',
  clearMocks: true,
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  setupFilesAfterEnv: ['<rootDir>/../../jest.esm-setup.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/../../tsconfig.spec.json' }],
  },
  moduleNameMapper: {
    '@openfeature/flagd-core': ['<rootDir>/../../../../shared/flagd-core/src'],
    '(.+)\\.js$': '$1',
  },
  // The conformance suites are Docker-gated and deliberately excluded from the default build, which
  // this target is part of: `npm run e2e` runs it for every project and CI has a job for that. They
  // have their own Jest config and their own `tck` target -- see tck/jest.config.ts.
  testPathIgnorePatterns: ['<rootDir>/tck/'],
  verbose: true,
};

module.exports = config;

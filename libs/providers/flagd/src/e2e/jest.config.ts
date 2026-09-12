import type { Config } from 'jest';

const config: Config = {
  displayName: 'providers-flagd-e2e',
  clearMocks: true,
  preset: 'ts-jest',
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

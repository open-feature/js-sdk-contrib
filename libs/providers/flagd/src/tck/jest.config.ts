import type { Config } from 'jest';

/**
 * A Jest project of its own over `src/tck/`, so `npx nx tck providers-flagd` is the only thing that
 * runs the conformance suites. Why they are excluded from the default build is in the README.
 */
const config: Config = {
  displayName: 'providers-flagd-tck',
  clearMocks: true,
  preset: 'ts-jest',
  moduleNameMapper: {
    // Workspace libraries resolved through tsconfig paths, which ts-jest does not read.
    '@openfeature/flagd-core': ['<rootDir>/../../../../shared/flagd-core/src'],
    '@openfeature/tck': ['<rootDir>/../../../../shared/tck/src'],
    '(.+)\\.js$': '$1',
  },
  verbose: true,
};

module.exports = config;

import type { Config } from 'jest';

/**
 * A Jest project of its own over `src/tck/`, so `npx nx tck providers-ofrep` is the only thing that
 * runs the conformance suite. Why it is excluded from the default build is in the README.
 */
const config: Config = {
  displayName: 'providers-ofrep-tck',
  clearMocks: true,
  preset: 'ts-jest',
  moduleNameMapper: {
    // Both are workspace libraries resolved through tsconfig paths, which ts-jest does not read.
    '@openfeature/ofrep-core': ['<rootDir>/../../../../shared/ofrep-core/src'],
    '@openfeature/tck': ['<rootDir>/../../../../shared/tck/src'],
    '(.+)\\.js$': '$1',
  },
  verbose: true,
};

module.exports = config;

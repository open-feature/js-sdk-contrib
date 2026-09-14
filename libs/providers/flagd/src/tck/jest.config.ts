import type { Config } from 'jest';

/**
 * The OpenFeature Provider Conformance Suite, kept out of the default build on purpose.
 *
 * A Jest project of its own over `src/tck/`, which is what does the selecting: the unit config
 * ignores that directory and the e2e config never sees it, so `npx nx tck providers-flagd` is the
 * only thing that runs these suites. Why they are excluded rather than gated is in this provider's
 * README.
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

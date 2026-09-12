import type { Config } from 'jest';

/**
 * The OpenFeature Provider Conformance Suite, kept out of the default build on purpose.
 *
 * A separate Jest project from `../jest.config.ts` so that `nx e2e providers-flagd` -- which
 * `npm run e2e` runs for every project, and which CI has a job for -- cannot pick these suites up.
 * They need a Docker daemon, pull a pinned backend image, and pin a conformance claim to that exact
 * tag, so they are run by hand before merge rather than on every push. `../jest.config.ts` ignores
 * this directory; nothing else has to be remembered.
 *
 * Run with `npx nx tck providers-flagd`.
 */
const config: Config = {
  displayName: 'providers-flagd-tck',
  clearMocks: true,
  preset: 'ts-jest',
  moduleNameMapper: {
    // Workspace libraries resolved through tsconfig paths, which ts-jest does not read.
    '@openfeature/flagd-core': ['<rootDir>/../../../../../shared/flagd-core/src'],
    '@openfeature/tck': ['<rootDir>/../../../../../shared/tck/src'],
    '(.+)\\.js$': '$1',
  },
  verbose: true,
};

module.exports = config;

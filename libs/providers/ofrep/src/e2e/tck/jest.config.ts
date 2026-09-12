import type { Config } from 'jest';

/**
 * The OpenFeature Provider Conformance Suite, kept out of the default build on purpose.
 *
 * A target and a Jest project of its own -- `nx tck providers-ofrep` -- rather than an `e2e` target,
 * because `npm run e2e` is `nx run-many --all --target=e2e` and CI has a job for exactly that. This
 * suite needs a Docker daemon, pulls a pinned backend image, and pins its conformance claim to that
 * exact tag, so it is run by hand before merge. The provider's unit config ignores everything under
 * `src/e2e`, so nothing else has to be remembered.
 */
const config: Config = {
  displayName: 'providers-ofrep-tck',
  clearMocks: true,
  preset: 'ts-jest',
  moduleNameMapper: {
    // Both are workspace libraries resolved through tsconfig paths, which ts-jest does not read.
    '@openfeature/ofrep-core': ['<rootDir>/../../../../../shared/ofrep-core/src'],
    '@openfeature/tck': ['<rootDir>/../../../../../shared/tck/src'],
    '(.+)\\.js$': '$1',
  },
  verbose: true,
};

module.exports = config;

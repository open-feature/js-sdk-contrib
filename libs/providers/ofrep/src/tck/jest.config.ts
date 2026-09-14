import type { Config } from 'jest';

/**
 * The OpenFeature Provider Conformance Suite, kept out of the default build on purpose.
 *
 * A Jest project of its own over `src/tck/`, which is what does the selecting: the provider's unit
 * config ignores that directory, so `npx nx tck providers-ofrep` is the only thing that runs this
 * suite. Why the target is not called `e2e`, and why the suite has a directory of its own, is in
 * this provider's README.
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

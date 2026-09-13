import type { Config } from 'jest';

/**
 * The OpenFeature Provider Conformance Suite, kept out of the default build on purpose.
 *
 * A Jest project of its own, over its own directory. `src/tck/` is a sibling of the provider's
 * source rather than a child of an `e2e` directory, because a conformance suite is not a kind of
 * e2e test: an e2e suite is expected green, while this one fails scenarios by design wherever a
 * `knownDeviation` is declared. This project had no e2e suite at all -- the `e2e` directory existed
 * only to hold this one -- so nesting was pure misfiling.
 *
 * The target is `tck` and deliberately not `e2e`: `npm run e2e` is `nx run-many --all --target=e2e`
 * and CI has a job for exactly that, so an `e2e` target here would pull a backend image on every
 * push and pin a conformance claim nobody read. The provider's unit config ignores `/src/tck/`, so
 * `npx nx tck providers-ofrep` is the only way in.
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

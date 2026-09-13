import type { Config } from 'jest';

/**
 * The OpenFeature Provider Conformance Suite, kept out of the default build on purpose.
 *
 * A Jest project of its own, over its own directory: `src/tck/` is a sibling of `src/e2e/` rather
 * than a child of it, because a conformance suite is not a kind of e2e test. The e2e suites test
 * this provider against flagd's own harness and are expected green; this one tests it against the
 * OpenFeature provider contract and fails scenarios by design wherever a `knownDeviation` is
 * declared.
 *
 * The directory is also what does the selecting. The unit config ignores `/src/tck/` and the e2e
 * config never sees it, so neither `nx test providers-flagd` nor `nx e2e providers-flagd` -- which
 * `npm run e2e` runs for every project, and which CI has a job for -- can pick these suites up.
 * They need a Docker daemon, pull a pinned backend image, and pin a conformance claim to that exact
 * tag, so they are run by hand before merge rather than on every push.
 *
 * Run with `npx nx tck providers-flagd`.
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

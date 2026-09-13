import type { Config } from 'jest';

const config: Config = {
  displayName: 'providers-flagd-e2e',
  clearMocks: true,
  preset: 'ts-jest',
  moduleNameMapper: {
    '@openfeature/flagd-core': ['<rootDir>/../../../../shared/flagd-core/src'],
    '(.+)\\.js$': '$1',
  },
  // The conformance suites are not here: they live in `../tck`, a sibling directory with its own
  // Jest config and its own `tck` target. This config used to have to ignore them; now the
  // directory boundary does it, which is the point of moving them out.
  verbose: true,
};

module.exports = config;

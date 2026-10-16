import type { Config } from 'jest';

const config: Config = {
  displayName: 'providers-flagsmith-tck',
  clearMocks: true,
  preset: 'ts-jest',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/../../tsconfig.spec.json' }],
  },
  moduleNameMapper: {
    '^@openfeature/tck$': '<rootDir>/../../../../shared/tck/src/index.ts',
    // No generic "(.+)\\.js$" -> "$1" rule here, unlike the flagd e2e config: it is too greedy,
    // rewriting package names ending in "-js" too, which breaks @grpc/grpc-js.
  },
  // No testTimeout, deliberately: runProviderTck calls jest.setTimeout itself from the suite's own
  // eventTimeoutMs and readyTimeoutMs, so a value here would read as the bound and not be one.
};

module.exports = config;

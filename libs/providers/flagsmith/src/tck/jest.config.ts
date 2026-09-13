import type { Config } from 'jest';

const config: Config = {
  displayName: 'providers-flagsmith-tck',
  clearMocks: true,
  preset: 'ts-jest',
  // Pointed at the library's spec tsconfig, which chains up to tsconfig.base.json where
  // @openfeature/tck is mapped to the workspace source.
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/../../tsconfig.spec.json' }],
  },
  moduleNameMapper: {
    '^@openfeature/tck$': '<rootDir>/../../../../shared/tck/src/index.ts',
    // NOTE: no generic "(.+)\\.js$" -> "$1" rule here, unlike the flagd e2e config. It is too
    // greedy: it rewrites package names ending in "-js" too, and breaks @grpc/grpc-js.
  },
  // No testTimeout here, deliberately. runProviderTck calls jest.setTimeout itself, derived from
  // the suite's own eventTimeoutMs and readyTimeoutMs, so a value here would be both redundant and
  // misleading -- it would read as the bound while the suite quietly applied a different one.
};

module.exports = config;

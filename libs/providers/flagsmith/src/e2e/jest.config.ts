import type { Config } from 'jest';

const config: Config = {
  displayName: 'providers-flagsmith-e2e',
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
  // The suite starts a container and drives it through the control API before every scenario.
  testTimeout: 120000,
};

module.exports = config;

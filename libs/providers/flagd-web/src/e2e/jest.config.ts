/* eslint-disable */
module.exports = {
  displayName: 'providers-flagd-web-e2e',
  clearMocks: true,
  // ESM mode so the ESM-only `cborg` dependency (via flagd-core) loads natively (NODE_OPTIONS=--experimental-vm-modules is set on the e2e CI job).
  extensionsToTreatAsEsm: ['.ts'],
  setupFilesAfterEnv: ['<rootDir>/../../jest.esm-setup.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: '<rootDir>/../../tsconfig.spec.json',
      },
    ],
  },
  // node env (not jsdom): testcontainers needs real node globals (ReadableStream etc.); matches the pre-ESM config which used the ts-jest default (node).
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'html'],
  moduleNameMapper: {
    '@openfeature/flagd-core': ['<rootDir>/../../../../shared/flagd-core/src'],
    '(.+)\\.js$': '$1',
  },
  verbose: true,
};

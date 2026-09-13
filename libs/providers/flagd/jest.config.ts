/* eslint-disable */
module.exports = {
  displayName: 'providers-flagd',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.esm-setup.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true, // `cborg` dependency (via flagd-core) needs ESM
        tsconfig: '<rootDir>/tsconfig.spec.json',
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  // ignore the e2e and conformance paths: both are Docker-gated and have targets of their own
  // (`nx e2e providers-flagd`, `nx tck providers-flagd`). `/src/tck/` is anchored so it cannot
  // match a `tck` directory under `lib/`.
  testPathIgnorePatterns: ['/e2e/', '/src/tck/'],
  coverageDirectory: '../../../coverage/libs/providers/flagd',
};

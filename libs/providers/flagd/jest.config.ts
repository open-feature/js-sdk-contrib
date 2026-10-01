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
  // ignore e2e path
  testPathIgnorePatterns: ['/e2e/'],
  coverageDirectory: '../../../coverage/libs/providers/flagd',
};

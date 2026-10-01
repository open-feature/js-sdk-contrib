/* eslint-disable */
module.exports = {
  displayName: 'providers-flagd-web',
  preset: '../../../jest.preset.js',
  // ESM mode so the ESM-only `cborg` dependency (via flagd-core) loads natively (NODE_OPTIONS=--experimental-vm-modules is set on the project.json test target).
  extensionsToTreatAsEsm: ['.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.esm-setup.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: '<rootDir>/tsconfig.spec.json',
      },
    ],
  },
  testEnvironment: 'jsdom',
  moduleFileExtensions: ['ts', 'js', 'html'],
  // ignore e2e path
  testPathIgnorePatterns: ['/e2e/'],
  coverageDirectory: '../../../coverage/libs/providers/flagd-web',
};

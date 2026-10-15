/* eslint-disable */
module.exports = {
  displayName: 'flagd-core',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  coverageDirectory: '../../../coverage/libs/shared/flagd-core',
  // ESM mode so the ESM-only `cborg` dependency loads natively (NODE_OPTIONS=--experimental-vm-modules is set on the project.json test target).
  extensionsToTreatAsEsm: ['.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.esm-setup.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
};

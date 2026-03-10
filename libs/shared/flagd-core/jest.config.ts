/* eslint-disable */
export default {
  displayName: 'flagd-core',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  coverageDirectory: '../../../coverage/libs/shared/flagd-core',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
};

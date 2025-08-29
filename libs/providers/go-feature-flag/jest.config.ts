/* eslint-disable */
export default {
  displayName: 'provider-go-feature-flag',
  preset: '../../../jest.preset.js',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../../coverage/libs/providers/go-feature-flag',
  testEnvironment: 'node',
};

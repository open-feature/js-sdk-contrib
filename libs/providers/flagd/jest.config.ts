/* eslint-disable */
export default {
  displayName: 'providers-flagd',
  preset: '../../../jest.preset.js',
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  // ignore e2e path
  testPathIgnorePatterns: ['/e2e/'],
  coverageDirectory: '../../../coverage/libs/providers/flagd',
};

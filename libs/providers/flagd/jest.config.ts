/* eslint-disable */
export default {
  displayName: 'providers-flagd',
  preset: '../../../jest.preset.js',
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.spec.json',
    },
  },
  transform: {
    '^.+\\.[tj]s$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  // ignore e2e path
  testPathIgnorePatterns: ["/e2e/"],
  coverageDirectory: '../../../coverage/libs/providers/flagd',
  forceExit: false,
};

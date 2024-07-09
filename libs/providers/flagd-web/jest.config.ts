/* eslint-disable */
export default {
  displayName: 'providers-flagd-web',
  preset: '../../../jest.preset.js',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.spec.json'
    }]
  },
  testEnvironment: 'jsdom',
  moduleFileExtensions: ['ts', 'js', 'html'],
  // ignore e2e path
  testPathIgnorePatterns: ["/e2e/"],
  coverageDirectory: '../../../coverage/libs/providers/flagd-web',
};

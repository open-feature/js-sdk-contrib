/* eslint-disable */
module.exports = {
  displayName: 'providers-flagsmith',
  preset: '../../../jest.preset.js',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  // The Docker-gated conformance suite runs through its own `tck` target. Without this ignore the
  // unit-test target picks the spec up and fails on 'TextDecoder is not defined' before it can
  // even import testcontainers.
  testPathIgnorePatterns: ['/tck/'],
  coverageDirectory: '../../../coverage/libs/providers/flagsmith',
};

/* eslint-disable */
module.exports = {
  displayName: 'providers-flagsmith',
  preset: '../../../jest.preset.js',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  // The conformance suite lives under src/tck, needs Docker, and is deliberately excluded from
  // the default build -- it runs through its own `tck` target, which no CI job invokes. Without
  // this ignore the unit-test target picks the spec up for no better reason than the directory it
  // sits in, and fails on 'TextDecoder is not defined' before it can import testcontainers. That
  // is exactly the trap the TCK README warns about, and it caught this adoption once.
  testPathIgnorePatterns: ['/tck/'],
  coverageDirectory: '../../../coverage/libs/providers/flagsmith',
};

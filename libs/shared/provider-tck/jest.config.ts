/* eslint-disable */
module.exports = {
  displayName: 'provider-tck',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],

  // multiProvider.spec.ts does not run yet: the SDK's MultiProvider fails 16 of the 29 scenarios,
  // all from one root cause -- it replaces every child error code with GENERAL. Tracked upstream;
  // see the comment at the top of that file. Re-enabling is deleting this line.
  testPathIgnorePatterns: ['<rootDir>/src/lib/multiProvider.spec.ts'],
  coverageDirectory: '../../../coverage/libs/shared/provider-tck',
};

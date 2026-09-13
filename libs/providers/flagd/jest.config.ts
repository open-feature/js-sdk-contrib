/* eslint-disable */
module.exports = {
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
  // ignore the e2e and conformance paths: both are Docker-gated and have targets of their own
  // (`nx e2e providers-flagd`, `nx tck providers-flagd`). `/src/tck/` is anchored so it cannot
  // match a `tck` directory under `lib/`.
  testPathIgnorePatterns: ['/e2e/', '/src/tck/'],
  coverageDirectory: '../../../coverage/libs/providers/flagd',
};

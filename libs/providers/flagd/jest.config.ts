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
  // both are Docker-gated, with targets of their own. `/src/tck/` is anchored so it cannot match a
  // `tck` directory under `lib/`.
  testPathIgnorePatterns: ['/e2e/', '/src/tck/'],
  coverageDirectory: '../../../coverage/libs/providers/flagd',
};

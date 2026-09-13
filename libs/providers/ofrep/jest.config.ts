/* eslint-disable */
module.exports = {
  displayName: 'providers-ofrep',
  preset: '../../../jest.preset.js',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  testEnvironment: 'node',
  // ignore the Docker-gated conformance suite, which has a target of its own
  // (`nx tck providers-ofrep`). `/src/tck/` is anchored so it cannot match a `tck` directory under
  // `lib/`. `/e2e/` is kept for any e2e suite this project gains later; it has none today.
  testPathIgnorePatterns: ['/e2e/', '/src/tck/'],
  coverageDirectory: '../../../coverage/libs/providers/ofrep',
};

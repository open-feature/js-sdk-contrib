/* eslint-disable */
module.exports = {
  displayName: 'providers-ofrep',
  preset: '../../../jest.preset.js',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  testEnvironment: 'node',
  // the Docker-gated conformance suite has a target of its own. `/src/tck/` is anchored so it
  // cannot match a `tck` directory under `lib/`; `/e2e/` is for any e2e suite added later.
  testPathIgnorePatterns: ['/e2e/', '/src/tck/'],
  coverageDirectory: '../../../coverage/libs/providers/ofrep',
};

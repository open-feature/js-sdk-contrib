/* eslint-disable */
module.exports = {
  displayName: 'providers-ofrep',
  preset: '../../../jest.preset.js',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  testEnvironment: 'node',
  // ignore e2e path
  testPathIgnorePatterns: ['/e2e/'],
  coverageDirectory: '../../../coverage/libs/providers/ofrep',
};

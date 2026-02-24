/* eslint-disable */
export default {
  displayName: 'flagd-core',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  // Do not attempt to transform plain .js files (generated validators, jest environment).
  // These are already valid CommonJS and don't need ts-jest processing.
  transformIgnorePatterns: ['\\.js$'],
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../../coverage/libs/shared/flagd-core',
};

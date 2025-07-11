/* eslint-disable */
export default {
  displayName: 'providers-ofrep-web',
  preset: '../../../jest.preset.js',
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.spec.json',
    },
  },
  transform: {
    '^.+\\.[tj]s$': 'ts-jest',
  },
  testEnvironment: 'node', // Use 'node' so we can run msw test server
  moduleFileExtensions: ['ts', 'js', 'html'],
  setupFiles: ['./jest.polyfills.js'],
};

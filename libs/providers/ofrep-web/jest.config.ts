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
  testEnvironment: 'jsdom',
  moduleFileExtensions: ['ts', 'js', 'html'],
  setupFiles: ['./jest.polyfills.js'],
};

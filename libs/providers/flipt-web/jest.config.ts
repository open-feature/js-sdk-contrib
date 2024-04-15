/* eslint-disable */
export default {
  displayName: 'providers-flipt-web',
  preset: '../../../jest.preset.js',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  testEnvironment: 'jsdom',
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../../coverage/libs/providers/flipt-web',
  setupFiles: ['<rootDir>/jest.polyfills.js'],
};

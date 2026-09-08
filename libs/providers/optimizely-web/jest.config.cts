module.exports = {
  displayName: 'optimizely-web',
  preset: '../../../jest.preset.js',
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/src/test/jest.setup.ts'],
  moduleNameMapper: {
    '^@optimizely/optimizely-sdk$':
      '<rootDir>/../../../node_modules/@optimizely/optimizely-sdk/dist/index.browser.min.js',
  },
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../../coverage/libs/providers/optimizely-web',
};

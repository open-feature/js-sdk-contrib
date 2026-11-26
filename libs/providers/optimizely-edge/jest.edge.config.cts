module.exports = {
  displayName: 'optimizely-edge (edge runtime)',
  preset: '../../../jest.preset.js',
  testEnvironment: '<rootDir>/src/test/jest-environment-web-worker.js',
  testMatch: ['<rootDir>/src/**/*.edge.spec.ts'],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../../coverage/libs/providers/optimizely-edge',
};

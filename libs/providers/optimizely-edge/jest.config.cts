module.exports = {
  displayName: 'optimizely-edge',
  preset: '../../../jest.preset.js',
  testEnvironment: 'node',
  testPathIgnorePatterns: ['\\.edge\\.spec\\.ts$'],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../../coverage/libs/providers/optimizely-edge',
};

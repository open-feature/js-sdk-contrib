module.exports = {
  displayName: 'module-sbom',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['js', 'json'],
  coverageDirectory: '../../coverage/tools/sbom',
};

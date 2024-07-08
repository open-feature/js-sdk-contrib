export default {
  displayName: 'providers-flagd-web-e2e',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: './tsconfig.lib.json' }],
  },
  moduleNameMapper: {
    '^(.*)\\.js$': ['$1.js', '$1.ts', '$1'],
  },
  testEnvironment: 'node',
  preset: 'ts-jest',
  clearMocks: true,
  setupFiles: [],
  verbose: true,
  silent: false,
};

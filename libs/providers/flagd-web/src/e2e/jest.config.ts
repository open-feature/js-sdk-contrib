export default {
  displayName: 'providers-flagd-web-e2e',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsConfig: './tsconfig.lib.json' }],
  },
  moduleNameMapper: {
    '^(.*)\\.js$': ['$1.js', '$1.ts', '$1'],
  },
  testEnvironment: 'node',
  preset: 'ts-jest',
  clearMocks: true,
  setupFiles: ['./setup.ts'],
  verbose: true,
  silent: false,
};

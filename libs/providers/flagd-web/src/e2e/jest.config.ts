export default {
  displayName: 'providers-flagd-web-e2e',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsConfig: './tsconfig.lib.json'}],
  },
  testEnvironment: 'node',
  preset: 'ts-jest',
  clearMocks: true,
  setupFiles: ['./setup.ts'],
  verbose: true,
  silent: false,
};
export default {
  displayName: 'providers-flagd-e2e',
  clearMocks: true,
  preset: 'ts-jest',
  verbose: true,
  silent: false,
  moduleNameMapper: {
    '@openfeature/flagd-core': ['<rootDir>/../../../../shared/flagd-core/src'],
  },
  globalTeardown: './setup-after.ts'
};

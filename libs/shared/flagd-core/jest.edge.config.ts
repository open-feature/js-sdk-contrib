/* eslint-disable */

/**
 * Separate Jest config for edge runtime compatibility tests.
 *
 * Re-runs flagd-core spec files in an environment that blocks eval() and
 * new Function(), proving compatibility with edge function runtimes.
 * moduleNameMapper transparently injects { disableDynamicCodeGeneration: true }
 * into FlagdCore and Targeting constructors via thin wrappers.
 *
 * This config uses V8 coverage (instead of Istanbul) because Istanbul
 * instrumentation injects new Function() calls, which the edge runtime
 * environment blocks.
 */
export default {
  displayName: 'flagd-core (disableDynamicCodeGeneration)',
  preset: '../../../jest.preset.js',
  coverageProvider: 'v8',
  testEnvironment: '<rootDir>/test/jest-environment-web-worker.js',
  testMatch: ['<rootDir>/src/lib/flagd-core.spec.ts', '<rootDir>/src/lib/targeting/targeting.spec.ts'],
  moduleNameMapper: {
    '^\\./flagd-core$': '<rootDir>/test/mocks/flagd-core-web-worker.ts',
    '^\\./targeting$': '<rootDir>/test/mocks/targeting-web-worker.ts',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
};

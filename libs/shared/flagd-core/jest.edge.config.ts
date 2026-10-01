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
module.exports = {
  displayName: 'flagd-core (disableDynamicCodeGeneration)',
  preset: '../../../jest.preset.js',
  coverageProvider: 'v8',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/lib/flagd-core.spec.ts', '<rootDir>/src/lib/targeting/targeting.spec.ts'],
  // ESM mode for cborg (NODE_OPTIONS=--experimental-vm-modules on the project.json target); uses the built-in `node` env (custom envs break Jest ESM) with the edge no-code-gen restriction enforced via a setup file.
  extensionsToTreatAsEsm: ['.ts'],
  setupFilesAfterEnv: ['<rootDir>/jest.esm-setup.ts', '<rootDir>/test/block-dynamic-codegen.ts'],
  moduleNameMapper: {
    '^\\./flagd-core$': '<rootDir>/test/mocks/flagd-core-web-worker.ts',
    '^\\./targeting$': '<rootDir>/test/mocks/targeting-web-worker.ts',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
};

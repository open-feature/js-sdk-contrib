/* eslint-disable */
const sharedTransform = {
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  // Do not attempt to transform plain .js files (generated validators, jest environment).
  // These are already valid CommonJS and don't need ts-jest processing.
  transformIgnorePatterns: ['\\.js$'],
  moduleFileExtensions: ['ts', 'js', 'html'],
};

export default {
  projects: [
    {
      // Standard project: all spec files, node environment
      displayName: 'flagd-core',
      preset: '../../../jest.preset.js',
      testEnvironment: 'node',
      coverageDirectory: '../../../coverage/libs/shared/flagd-core',
      ...sharedTransform,
    },
    {
      // Restricted project: re-runs the original spec files in an environment that
      // blocks eval() and new Function(), proving Workers compatibility.
      // moduleNameMapper transparently injects { disableDynamicCodeGeneration: true }
      // into FlagdCore and Targeting constructors via thin wrappers — no test changes needed.
      displayName: 'flagd-core (restricted)',
      preset: '../../../jest.preset.js',
      testEnvironment: '<rootDir>/test/jest-environment-web-worker.js',
      testMatch: [
        '<rootDir>/src/lib/flagd-core.spec.ts',
        '<rootDir>/src/lib/targeting/targeting.spec.ts',
        '<rootDir>/src/**/*.web-worker.spec.ts',
      ],
      moduleNameMapper: {
        // Redirect FlagdCore and Targeting imports to WebWorker-mode wrappers.
        // These patterns match the exact import strings used in the spec files.
        '^\\./flagd-core$': '<rootDir>/test/mocks/flagd-core-web-worker.ts',
        '^\\./targeting$': '<rootDir>/test/mocks/targeting-web-worker.ts',
      },
      // Sets global.__webWorker__ = true so tests can branch on the one assertion
      // where compiled vs interpreter mode differs.
      setupFilesAfterEnv: ['<rootDir>/test/setup-web-worker.js'],
      ...sharedTransform,
    },
  ],
};

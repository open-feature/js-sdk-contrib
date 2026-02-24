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
      // Restricted project: runs *.workers.spec.ts files in an environment that
      // blocks eval() and new Function(), proving Workers compatibility.
      displayName: 'flagd-core (restricted)',
      preset: '../../../jest.preset.js',
      testEnvironment: '<rootDir>/test/jest-environment-worker.js',
      testMatch: ['<rootDir>/src/**/*.workers.spec.ts'],
      ...sharedTransform,
    },
  ],
};

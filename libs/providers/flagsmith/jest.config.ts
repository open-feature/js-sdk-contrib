/* eslint-disable */
export default {
  displayName: 'providers-flagsmith-client',
  preset: '../../../jest.preset.js',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  transformIgnorePatterns: [ 'node_modules/*.d.ts', ],
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../../coverage/libs/providers/flagsmith-client',
};

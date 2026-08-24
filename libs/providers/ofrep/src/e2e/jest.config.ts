import type { Config } from 'jest';

const config: Config = {
  displayName: 'providers-ofrep-e2e',
  clearMocks: true,
  preset: 'ts-jest',
  moduleNameMapper: {
    // Both are workspace libraries resolved through tsconfig paths, which ts-jest does not read.
    '@openfeature/ofrep-core': ['<rootDir>/../../../../shared/ofrep-core/src'],
    '@openfeature/tck': ['<rootDir>/../../../../shared/tck/src'],
    '(.+)\\.js$': '$1',
  },
  verbose: true,
};

module.exports = config;

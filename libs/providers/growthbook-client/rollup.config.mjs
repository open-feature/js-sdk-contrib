import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import esbuild from 'rollup-plugin-esbuild';

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/global/index.js',
    format: 'iife',
    name: 'GrowthbookProvider',
    globals: {
      '@openfeature/web-sdk': 'OpenFeature',
      '@growthbook/growthbook': 'growthbook',
    },
    sourcemap: true,
  },
  external: ['@openfeature/web-sdk', '@growthbook/growthbook'],
  plugins: [
    commonjs(),
    resolve(),
    esbuild({
      target: 'es2017',
      tsconfig: './tsconfig.json',
    }),
  ],
};

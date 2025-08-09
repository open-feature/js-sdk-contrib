import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import esbuild from 'rollup-plugin-esbuild';
import terser from '@rollup/plugin-terser';

const bundle = {
  input: 'src/index.ts',
  output: {
    file: 'dist/global/index.js',
    format: 'iife',
    name: 'LaunchDarklyProvider',
    globals: {
      '@openfeature/web-sdk': 'OpenFeature',
      'launchdarkly-js-client-sdk': 'LDClient',
    },
    sourcemap: true,
  },
  external: ['@openfeature/web-sdk', 'launchdarkly-js-client-sdk'],
  plugins: [
    commonjs(),
    resolve(),
    esbuild({
      target: 'es2017',
      tsconfig: './tsconfig.json',
    }),
  ],
};

export default [
  bundle,
  {
    ...bundle,
    output: {
      ...bundle.output,
      file: 'dist/global/index.min.js',
    },
    plugins: [...bundle.plugins, terser()],
  },
];

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EdgeVM } from '@edge-runtime/vm';
import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { rollup } from 'rollup';

describe('Optimizely edge package output', () => {
  const packageRoot = resolve(__dirname, '../../../../../dist/libs/providers/optimizely-edge');

  it('publishes an ESM entry point without Node-only imports', () => {
    const packageJsonPath = resolve(packageRoot, 'package.json');
    const entryPath = resolve(packageRoot, 'index.esm.js');

    expect(existsSync(packageJsonPath)).toBe(true);

    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      exports: { '.': { import: string; types: string } };
    };
    const entry = readFileSync(entryPath, 'utf8');

    expect(packageJson.exports['.'].import).toBe('./index.esm.js');
    expect(packageJson.exports['.'].types).toBe('./index.d.ts');
    expect(existsSync(resolve(packageRoot, packageJson.exports['.'].import))).toBe(true);
    expect(existsSync(resolve(packageRoot, packageJson.exports['.'].types))).toBe(true);
    expect(entry).toContain("from '@optimizely/optimizely-sdk/universal'");
    expect(entry).not.toMatch(/\brequire\s*\(/);
    expect(entry).not.toMatch(/\bnode:/);
  });

  it('bundles the published dependency graph and executes it in an edge VM', async () => {
    const entryPath = resolve(packageRoot, 'index.esm.js');
    const bundle = await rollup({
      input: entryPath,
      plugins: [nodeResolve({ browser: true, exportConditions: ['edge', 'browser', 'import'] }), commonjs()],
      onwarn(warning) {
        if (warning.code === 'UNRESOLVED_IMPORT') {
          throw new Error(warning.message);
        }
      },
    });

    try {
      const { output } = await bundle.generate({ format: 'iife', name: 'OptimizelyEdge' });
      const code = output.map((chunk) => ('code' in chunk ? chunk.code : '')).join('\n');

      expect(code).not.toMatch(/\bnode:/);
      expect(code).not.toMatch(/\brequire\s*\(/);
      expect(
        () =>
          new EdgeVM({
            initialCode: `${code}; if (typeof OptimizelyEdge.OptimizelyEdgeProvider !== 'function') {
              throw new Error('Provider export missing from edge bundle');
            }`,
          }),
      ).not.toThrow();
    } finally {
      await bundle.close();
    }
  }, 30_000);
});

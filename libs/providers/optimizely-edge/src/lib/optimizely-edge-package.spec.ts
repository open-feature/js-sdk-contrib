import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Optimizely edge package output', () => {
  const packageRoot = resolve(__dirname, '../../../../../dist/libs/providers/optimizely-edge');

  it('publishes an ESM entry point without Node-only imports', () => {
    const packageJsonPath = resolve(packageRoot, 'package.json');
    const entryPath = resolve(packageRoot, 'index.esm.js');

    expect(existsSync(packageJsonPath)).toBe(true);
    expect(existsSync(entryPath)).toBe(true);

    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      exports?: { '.': { import?: string } };
    };
    const entry = readFileSync(entryPath, 'utf8');

    expect(packageJson.exports?.['.'].import).toBe('./index.esm.js');
    expect(entry).toContain("from '@optimizely/optimizely-sdk/universal'");
    expect(entry).not.toMatch(/\brequire\s*\(/);
    expect(entry).not.toMatch(/\bnode:/);
  });

  it('bundles the published dependency graph and executes it in an edge VM', () => {
    const entryPath = resolve(packageRoot, 'index.esm.js');
    const script = `
      const { rollup } = require('rollup');
      const commonjs = require('@rollup/plugin-commonjs');
      const { nodeResolve } = require('@rollup/plugin-node-resolve');
      const { EdgeVM } = require('@edge-runtime/vm');

      (async () => {
        const bundle = await rollup({
          input: ${JSON.stringify(entryPath)},
          plugins: [
            nodeResolve({ browser: true, exportConditions: ['edge', 'browser', 'import'] }),
            commonjs(),
          ],
          onwarn(warning) {
            if (warning.code === 'UNRESOLVED_IMPORT') throw new Error(warning.message);
          },
        });
        const { output } = await bundle.generate({ format: 'iife', name: 'OptimizelyEdge' });
        const code = output.map((chunk) => chunk.code || '').join('\\n');

        if (/\\bnode:/.test(code) || /\\brequire\\s*\\(/.test(code)) {
          throw new Error('The consuming edge bundle contains a Node-only import or require call.');
        }

        new EdgeVM({
          initialCode: code + '; if (typeof OptimizelyEdge.OptimizelyEdgeProvider !== "function") {' +
            ' throw new Error("Provider export missing from edge bundle"); }',
        });
      })().catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
    `;

    expect(() => execFileSync(process.execPath, ['--eval', script], { stdio: 'pipe' })).not.toThrow();
  }, 30_000);
});

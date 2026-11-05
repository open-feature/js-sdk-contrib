const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  absolutizeDependencySpecifiers,
  generateModuleSbom,
  isolatedManifest,
  normalizeRootComponent,
} = require('./generate-module-sbom');

const repoRoot = path.join(__dirname, '../..');
const fixtureModule = path.join(__dirname, 'fixtures/module');

function componentPurls(sbom) {
  return (sbom.components || []).map((component) => component.purl);
}

describe('isolatedManifest', () => {
  const source = {
    name: '@openfeature/example-provider',
    version: '0.4.2',
    license: 'Apache-2.0',
    main: './index.js',
    scripts: { preinstall: 'exit 1' },
    dependencies: { '@fixture/runtime': 'file:../runtime' },
    optionalDependencies: { '@fixture/optional-runtime': 'file:../optional' },
    devDependencies: { '@fixture/dev-only': 'file:../dev-only' },
    peerDependencies: { '@fixture/peer-only': 'file:../peer-only' },
  };

  it('keeps runtime dependencies and drops dev, peer, and scripts', () => {
    const manifest = isolatedManifest(source);

    expect(manifest).toEqual({
      name: '@openfeature/example-provider',
      version: '0.4.2',
      license: 'Apache-2.0',
      dependencies: { '@fixture/runtime': 'file:../runtime' },
      optionalDependencies: { '@fixture/optional-runtime': 'file:../optional' },
    });
    expect(manifest.dependencies).not.toBe(source.dependencies);
  });

  it('omits empty dependency maps', () => {
    expect(isolatedManifest({ name: '@openfeature/env-var-provider', version: '0.3.1', dependencies: {} })).toEqual({
      name: '@openfeature/env-var-provider',
      version: '0.3.1',
    });
  });

  it('rejects a manifest without a name or version', () => {
    expect(() => isolatedManifest({ version: '1.0.0' })).toThrow(/name/);
    expect(() => isolatedManifest({ name: '@openfeature/example-provider' })).toThrow(/version/);
  });
});

describe('absolutizeDependencySpecifiers', () => {
  it('resolves relative file specifiers from the module directory and leaves registry ranges unchanged', () => {
    const manifest = absolutizeDependencySpecifiers(
      {
        name: '@openfeature/example-provider',
        version: '0.4.2',
        dependencies: {
          '@fixture/runtime': 'file:../runtime',
          tslib: '^2.8.1',
        },
        optionalDependencies: {
          '@fixture/optional-runtime': 'file:../optional',
        },
      },
      '/repo/libs/example',
    );

    expect(manifest.dependencies['@fixture/runtime']).toBe(`file:${path.resolve('/repo/libs/example', '../runtime')}`);
    expect(manifest.dependencies.tslib).toBe('^2.8.1');
    expect(manifest.optionalDependencies['@fixture/optional-runtime']).toBe(
      `file:${path.resolve('/repo/libs/example', '../optional')}`,
    );
  });

  it('preserves absolute file specifiers', () => {
    const absolute = 'file:/opt/packages/runtime';
    const manifest = absolutizeDependencySpecifiers(
      { dependencies: { '@fixture/runtime': absolute } },
      '/repo/libs/example',
    );

    expect(manifest.dependencies['@fixture/runtime']).toBe(absolute);
  });
});

describe('normalizeRootComponent', () => {
  it('replaces the temporary directory name with the package name', () => {
    const sbom = normalizeRootComponent(
      {
        bomFormat: 'CycloneDX',
        metadata: { component: { name: 'tmpXYZ', version: '0.0.0', type: 'application' } },
      },
      { name: '@openfeature/debounce-hook', version: '0.1.1' },
    );

    expect(sbom.metadata.component).toMatchObject({
      name: '@openfeature/debounce-hook',
      version: '0.1.1',
      type: 'library',
      'bom-ref': '@openfeature/debounce-hook@0.1.1',
    });
  });
});

describe('generateModuleSbom', () => {
  jest.setTimeout(120000);

  it('writes a CycloneDX SBOM containing only that module runtime tree', () => {
    const outputFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sbom-out-')), 'bom.json');
    const sbom = generateModuleSbom(fixtureModule, outputFile);
    const written = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
    const purls = componentPurls(sbom);
    const serialized = JSON.stringify(sbom);

    expect(written).toEqual(sbom);
    expect(sbom.bomFormat).toBe('CycloneDX');
    expect(sbom.metadata.component).toMatchObject({
      name: '@openfeature/example-provider',
      version: '0.4.2',
      type: 'library',
    });
    expect(purls).toEqual(
      expect.arrayContaining(['pkg:npm/%40fixture/runtime@1.2.0', 'pkg:npm/%40fixture/optional-runtime@3.0.0']),
    );
    expect(purls).toHaveLength(2);
    expect(serialized).not.toContain('@fixture/dev-only');
    expect(serialized).not.toContain('@fixture/peer-only');
    expect(serialized).not.toContain('@fixture/unrelated');
    expect(serialized).not.toContain('axios');
  });

  it('omits peer dependencies when a module has no runtime dependencies', () => {
    const outputFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sbom-out-')), 'bom.json');
    const sbom = generateModuleSbom(path.join(repoRoot, 'libs/providers/env-var'), outputFile);

    expect(sbom.metadata.component.name).toBe('@openfeature/env-var-provider');
    expect(sbom.metadata.component.version).toBe('0.3.1');
    expect(sbom.components || []).toHaveLength(0);
    expect(JSON.stringify(sbom)).not.toContain('@openfeature/server-sdk');
  });

  it('does not include the rest of the monorepo when resolving a published module', () => {
    const outputFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sbom-out-')), 'bom.json');
    const sbom = generateModuleSbom(path.join(repoRoot, 'libs/hooks/debounce'), outputFile);
    const purls = componentPurls(sbom);
    const serialized = JSON.stringify(sbom);

    expect(sbom.metadata.component).toMatchObject({
      name: '@openfeature/debounce-hook',
      version: '0.1.1',
    });
    expect(purls.some((purl) => purl.startsWith('pkg:npm/tslib@'))).toBe(true);
    expect(purls.length).toBeLessThan(10);
    expect(serialized).not.toContain('axios');
    expect(serialized).not.toContain('jest');
    expect(serialized).not.toContain('@grpc/grpc-js');
    expect(serialized).not.toContain('@openfeature/server-sdk');
  });

  it('rejects a directory without package.json', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sbom-missing-'));
    expect(() => generateModuleSbom(emptyDir, path.join(emptyDir, 'bom.json'))).toThrow(/package.json/);
  });
});

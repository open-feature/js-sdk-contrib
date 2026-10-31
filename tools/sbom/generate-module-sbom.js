/**
 * Build a CycloneDX SBOM for one published module.
 *
 * This repository is not an npm workspace, and the root lockfile lists every
 * module's dependencies. The release workflow runs this script once per
 * released package. The script copies that package's runtime dependencies
 * into a temporary project, resolves that tree, and writes a CycloneDX SBOM.
 * Dev dependencies and peer dependencies are not part of the tree.
 *
 * Usage: node tools/sbom/generate-module-sbom.js <module-dir> <output-file>
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEPENDENCY_FIELDS = ['dependencies', 'optionalDependencies'];

function isolatedManifest(pkg) {
  if (!pkg || typeof pkg.name !== 'string' || pkg.name.length === 0) {
    throw new Error('package.json must include a name');
  }
  if (typeof pkg.version !== 'string' || pkg.version.length === 0) {
    throw new Error(`package.json for ${pkg.name} must include a version`);
  }

  const manifest = {
    name: pkg.name,
    version: pkg.version,
  };
  if (typeof pkg.license === 'string' && pkg.license.length > 0) {
    manifest.license = pkg.license;
  }

  for (const field of DEPENDENCY_FIELDS) {
    const deps = cloneDependencyMap(pkg[field], field);
    if (deps) {
      manifest[field] = deps;
    }
  }

  return manifest;
}

function cloneDependencyMap(deps, field) {
  if (deps == null) {
    return undefined;
  }
  if (typeof deps !== 'object' || Array.isArray(deps)) {
    throw new Error(`${field} must be an object of package specifiers`);
  }

  const cloned = {};
  for (const [name, spec] of Object.entries(deps)) {
    if (typeof spec !== 'string' || spec.length === 0) {
      throw new Error(`${field} entry ${name} must be a specifier string`);
    }
    cloned[name] = spec;
  }
  return Object.keys(cloned).length > 0 ? cloned : undefined;
}

function absolutizeDependencySpecifiers(manifest, moduleDir) {
  const resolvedModuleDir = path.resolve(moduleDir);
  const next = { ...manifest };

  for (const field of DEPENDENCY_FIELDS) {
    if (!manifest[field]) {
      continue;
    }
    const deps = { ...manifest[field] };
    for (const [name, spec] of Object.entries(deps)) {
      deps[name] = absolutizeSpecifier(spec, resolvedModuleDir);
    }
    next[field] = deps;
  }

  return next;
}

function absolutizeSpecifier(spec, moduleDir) {
  let prefix;
  if (spec.startsWith('file:')) {
    prefix = 'file:';
  } else if (spec.startsWith('link:')) {
    prefix = 'link:';
  } else {
    return spec;
  }

  const target = spec.slice(prefix.length);
  if (path.isAbsolute(target)) {
    return spec;
  }
  return prefix + path.resolve(moduleDir, target);
}

function normalizeRootComponent(sbom, pkg) {
  const component = sbom && sbom.metadata && sbom.metadata.component;
  if (!component || typeof component !== 'object' || Array.isArray(component)) {
    throw new Error('CycloneDX SBOM is missing metadata.component');
  }

  // npm names the root component after the working directory. The published
  // package name and version are the identity consumers look up.
  component.type = 'library';
  component.name = pkg.name;
  component.version = pkg.version;
  component['bom-ref'] = `${pkg.name}@${pkg.version}`;
  return sbom;
}

function generateModuleSbom(moduleDir, outputFile) {
  const resolvedModuleDir = path.resolve(moduleDir);
  const packageJsonPath = path.join(resolvedModuleDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`No package.json found in ${resolvedModuleDir}`);
  }

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const manifest = absolutizeDependencySpecifiers(isolatedManifest(pkg), resolvedModuleDir);
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openfeature-sbom-'));

  try {
    fs.writeFileSync(path.join(workDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    runNpm(['install', '--package-lock-only', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund'], workDir);
    const stdout = runNpm(
      ['sbom', '--sbom-format=cyclonedx', '--sbom-type=library', '--omit=dev', '--omit=peer', '--package-lock-only'],
      workDir,
    );
    const sbom = JSON.parse(stdout);
    if (sbom.bomFormat !== 'CycloneDX') {
      throw new Error(`Expected a CycloneDX SBOM, received ${String(sbom.bomFormat)}`);
    }
    normalizeRootComponent(sbom, pkg);

    const resolvedOutput = path.resolve(outputFile);
    fs.mkdirSync(path.dirname(resolvedOutput), { recursive: true });
    fs.writeFileSync(resolvedOutput, `${JSON.stringify(sbom, null, 2)}\n`);
    return sbom;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

function runNpm(args, cwd) {
  try {
    return execFileSync('npm', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    const stderr = error && error.stderr ? error.stderr.toString() : '';
    const stdout = error && error.stdout ? error.stdout.toString() : '';
    const detail = stderr.trim() || stdout.trim() || (error && error.message) || String(error);
    throw new Error(`npm ${args.join(' ')} failed in ${cwd}\n${detail}`);
  }
}

function main() {
  const [moduleDir, outputFile] = process.argv.slice(2);
  if (!moduleDir || !outputFile || process.argv.slice(2).length !== 2) {
    process.stderr.write('Usage: node tools/sbom/generate-module-sbom.js <module-dir> <output-file>\n');
    process.exitCode = 1;
    return;
  }

  try {
    const sbom = generateModuleSbom(moduleDir, outputFile);
    const componentCount = Array.isArray(sbom.components) ? sbom.components.length : 0;
    process.stdout.write(
      `${sbom.metadata.component.name}@${sbom.metadata.component.version}: ${componentCount} components\n`,
    );
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  absolutizeDependencySpecifiers,
  generateModuleSbom,
  isolatedManifest,
  normalizeRootComponent,
};

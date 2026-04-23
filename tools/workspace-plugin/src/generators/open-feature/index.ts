import type { Tree } from '@nx/devkit';
import {
  formatFiles,
  generateFiles,
  getWorkspaceLayout,
  joinPathFragments,
  logger,
  names,
  updateJson,
  moveFilesToNewDirectory,
} from '@nx/devkit';
import { libraryGenerator } from '@nx/js';
import { Linter } from '@nx/eslint';

/**
 * Enforced by the json schema.
 */
interface SchemaOptions {
  name: string;
  type: 'hook' | 'provider';
  category: 'server' | 'client';
}

export default async function (tree: Tree, schema: SchemaOptions) {
  const { name, importPath, libFileName, projectRoot, libClassName, nxProjectName, directory } = normalizeOptions(
    tree,
    schema,
  );

  await libraryGenerator(tree, {
    name,
    config: 'project',
    publishable: true,
    directory,
    importPath,
    skipFormat: true,
    strict: true,
    buildable: true,
    compiler: 'tsc',
    unitTestRunner: 'jest',
    linter: Linter.EsLint,
  });

  // move the files to the right location in the tree
  moveFilesToNewDirectory(tree, directory, projectRoot);

  // delete the auto-generated files
  ['spec.ts', 'ts'].forEach((suffix) => {
    tree.delete(joinPathFragments(projectRoot, 'src', 'lib', `${name}.${suffix}`));
  });

  /**
   * Creates files using the shared and type specific templates
   */
  ['shared', `${schema.type}/${schema.category}`].forEach((folder) => {
    generateFiles(tree, joinPathFragments(__dirname, 'files', folder), projectRoot, {
      name,
      libFileName,
      libClassName,
      importPath,
      nxProjectName,
      tmpl: '',
    });
  });

  updateProject(tree, projectRoot, nxProjectName, name);
  updateTsConfig(tree, projectRoot);
  updateEslintrc(tree, projectRoot);
  updateJestConfig(tree, projectRoot);
  updatePackage(tree, projectRoot, schema);
  updateNxJson(tree);
  updateTsConfigBase(tree, importPath, projectRoot);
  updateReleasePleaseConfig(tree, projectRoot);
  updateReleasePleaseManifest(tree, projectRoot);
  await formatFiles(tree);

  return () => {
    logger.info('');
    logger.info('🎉 Success 🎉');
    logger.info('');
    logger.info('Next steps:');
    logger.info(` * View the project: ${projectRoot}`);
    logger.info(` * Test the project: nx test ${nxProjectName}`);
    logger.info(` * Build the project: nx package ${nxProjectName}`);
  };
}

function normalizeOptions(tree: Tree, schema: SchemaOptions) {
  const { fileName, name, className } = names(schema.name);
  const directory = `${schema.type}s`;
  const libClassName = `${className}${names(schema.type).className}`;
  const libFileName = `${fileName}-${schema.type}`;
  const nxProjectName = `${directory}-${fileName}`;
  const { libsDir } = getWorkspaceLayout(tree);
  const projectRoot = joinPathFragments(libsDir, directory, fileName);
  const importPath = `@openfeature/${fileName}-${schema.type}`;

  return {
    name,
    libClassName,
    libFileName,
    nxProjectName,
    importPath,
    fileName,
    projectRoot,
    directory,
  };
}

function updateProject(tree: Tree, projectRoot: string, nxProjectName: string, umdName: string) {
  updateJson(tree, joinPathFragments(projectRoot, 'project.json'), (json) => {
    // update name and paths that libraryGenerator sets incorrectly after moveFilesToNewDirectory
    json.name = nxProjectName;
    json['$schema'] = '../../../node_modules/nx/schemas/project-schema.json';
    json.sourceRoot = `${projectRoot}/src`;

    // remove stale nx release config added by libraryGenerator
    delete json.release;
    delete json.targets['nx-release-publish'];

    json.targets['package'] = {
      executor: '@nx/rollup:rollup',
      outputs: ['{options.outputPath}'],
      options: {
        project: `${projectRoot}/package.json`,
        outputPath: `dist/${projectRoot}`,
        entryFile: `${projectRoot}/src/index.ts`,
        tsConfig: `${projectRoot}/tsconfig.lib.json`,
        compiler: 'tsc',
        generateExportsField: true,
        umdName,
        external: 'all',
        format: ['cjs', 'esm'],
        assets: [
          // Move a "commonjs" package.json to the types root (js is bundled).
          // This prevents us from having to add file extensions to all our imports in ESM contexts, which ESM requires.
          {
            glob: 'package.json',
            input: './assets',
            output: './src/',
          },
          {
            glob: 'LICENSE',
            input: './',
            output: './',
          },
          {
            glob: 'README.md',
            input: `./${projectRoot}`,
            output: './',
          },
        ],
      },
    };

    // add publishing
    json.targets['publish'] = {
      executor: 'nx:run-commands',
      options: {
        command: 'npm run publish-if-not-exists',
        cwd: `dist/${projectRoot}`,
      },
      dependsOn: [
        {
          target: 'package',
        },
      ],
    };
    delete json.targets.build;

    // update lint outputs
    json.targets.lint = {
      executor: '@nx/eslint:lint',
      outputs: ['{options.outputFile}'],
    };

    // update jestConfig path
    json.targets.test.options.jestConfig = `${projectRoot}/jest.config.ts`;

    return json;
  });
}

function updatePackage(tree: Tree, projectRoot: string, schema: SchemaOptions) {
  updateJson(tree, joinPathFragments(projectRoot, 'package.json'), (json) => {
    json.scripts = {
      'publish-if-not-exists':
        'cp $NPM_CONFIG_USERCONFIG .npmrc && if [ "$(npm show $npm_package_name@$npm_package_version version)" = "$(npm run current-version -s)" ]; then echo \'already published, skipping\'; else npm publish --access public; fi',
      'current-version': 'echo $npm_package_version',
    };

    // use undefined or this defaults to "commonjs", which breaks things: https://github.com/open-feature/js-sdk-contrib/pull/596
    json.type = undefined;

    // match the initial version in the release-please manifest
    json.version = '0.1.0';

    // repository is required for npm OIDC trusted publishing / provenance
    json.repository = {
      type: 'git',
      url: 'https://github.com/open-feature/js-sdk-contrib.git',
      directory: projectRoot,
    };

    // everything should be Apache-2.0
    json.license = 'Apache-2.0';

    // client packages have a web-sdk dep, server js-sdk
    json.peerDependencies =
      schema.category === 'client'
        ? {
            '@openfeature/web-sdk': '^1.6.0',
          }
        : {
            '@openfeature/server-sdk': '^1.17.0',
          };

    return json;
  });
}

function updateTsConfig(tree: Tree, projectRoot: string) {
  updateJson(tree, joinPathFragments(projectRoot, 'tsconfig.json'), (json) => {
    json.compilerOptions.module = 'ES6';
    json.extends = `../../${json.extends}`;

    return json;
  });
}

function updateEslintrc(tree: Tree, projectRoot: string) {
  // Update .eslintrc.json root location
  updateJson(tree, joinPathFragments(projectRoot, '.eslintrc.json'), (json) => {
    json.extends = `../../${json.extends}`;
    return json;
  });
}

function updateJestConfig(tree: Tree, projectRoot: string) {
  const configPath = joinPathFragments(projectRoot, 'jest.config.ts');

  // Update jest.preset.js path
  let contents = tree.read(configPath)!.toString();
  const replaceJestPresetPath = contents.replace('../jest.preset.js', '../../../jest.preset.js');
  tree.write(configPath, replaceJestPresetPath);

  // Update coverage path
  contents = tree.read(configPath)!.toString();
  const replaceCoveragePath = contents.replace('../coverage/providers', `../../../coverage/${projectRoot}`);
  tree.write(configPath, replaceCoveragePath);
}

// remove stale release config that libraryGenerator adds to nx.json
function updateNxJson(tree: Tree) {
  updateJson(tree, 'nx.json', (json) => {
    delete json.release;
    return json;
  });
}

// update tsconfig paths that libraryGenerator registers incorrectly after moveFilesToNewDirectory
function updateTsConfigBase(tree: Tree, importPath: string, projectRoot: string) {
  updateJson(tree, 'tsconfig.base.json', (json) => {
    json.compilerOptions.paths[importPath] = [`${projectRoot}/src/index.ts`];
    return json;
  });
}

function updateReleasePleaseConfig(tree: Tree, projectRoot: string) {
  updateJson(tree, 'release-please-config.json', (json) => {
    json.packages[projectRoot] = {
      'release-type': 'node',
      prerelease: false,
      'bump-minor-pre-major': true,
      'bump-patch-for-minor-pre-major': true,
      versioning: 'default',
    };

    return json;
  });
}

// this starts everything at 0.1.0
function updateReleasePleaseManifest(tree: Tree, projectRoot: string) {
  updateJson(tree, '.release-please-manifest.json', (json) => {
    json[projectRoot] = '0.1.0';

    return json;
  });
}

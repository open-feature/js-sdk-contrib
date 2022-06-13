import {
  formatFiles,
  generateFiles,
  getWorkspaceLayout,
  joinPathFragments,
  logger,
  names,
  Tree,
  updateJson,
} from '@nrwl/devkit';
import { libraryGenerator } from '@nrwl/js';
import { Linter } from '@nrwl/linter';

/**
 * Enforced by the json schema.
 */
interface SchemaOptions {
  name: string;
  type: 'hook' | 'provider';
}

export default async function (tree: Tree, schema: SchemaOptions) {
  const {
    name,
    importPath,
    projectLibDir,
    libFileName,
    fileName,
    projectRoot,
    libClassName,
    nxProjectName,
    directory,
  } = normalizeOptions(tree, schema);

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

  /**
   * Refactors the auto-generated files
   */
  ['spec.ts', 'ts'].forEach((suffix) => {
    tree.rename(
      joinPathFragments(projectLibDir, `${directory}-${fileName}.${suffix}`),
      joinPathFragments(projectLibDir, `${libFileName}.${suffix}`)
    );
  });

  /**
   * Creates files using the shared and type specific templates
   */
  ['shared', schema.type].forEach((folder) => {
    generateFiles(
      tree,
      joinPathFragments(__dirname, 'files', folder),
      projectRoot,
      {
        name,
        libFileName,
        libClassName,
        importPath,
        nxProjectName,
        tmpl: '',
      }
    );
  });

  updateProject(tree, projectRoot, name);
  updateTsConfig(tree, projectRoot);
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
  const projectLibDir = joinPathFragments(projectRoot, 'src', 'lib');

  return {
    name,
    libClassName,
    libFileName,
    nxProjectName,
    importPath,
    projectLibDir,
    fileName,
    projectRoot,
    directory,
  };
}

function updateProject(tree: Tree, projectRoot: string, umdName: string) {
  updateJson(tree, joinPathFragments(projectRoot, 'project.json'), (json) => {
    json.targets['package'] = {
      executor: '@nrwl/web:rollup',
      outputs: ['{options.outputPath}'],
      options: {
        project: `${projectRoot}/package.json`,
        outputPath: `dist/${projectRoot}`,
        entryFile: `${projectRoot}/src/index.ts`,
        tsConfig: `${projectRoot}/tsconfig.lib.json`,
        compiler: 'babel',
        umdName,
        external: ['typescript'],
        format: ['cjs', 'esm'],
        assets: [
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

    json.targets.publish.dependsOn[0].target = 'package';
    delete json.targets.build;

    return json;
  });
}

function updateTsConfig(tree: Tree, projectRoot: string) {
  updateJson(tree, joinPathFragments(projectRoot, 'tsconfig.json'), (json) => {
    json.compilerOptions.module = 'ES6';

    return json;
  });
}

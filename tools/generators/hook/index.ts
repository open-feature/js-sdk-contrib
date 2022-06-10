import {
  Tree,
  formatFiles,
  names,
  logger,
  joinPathFragments,
  generateFiles,
  getWorkspaceLayout,
  updateJson,
} from '@nrwl/devkit';
import { libraryGenerator } from '@nrwl/js';
import { Linter } from '@nrwl/linter';

interface NewHookSchemaOptions {
  name: string;
}

const DIRECTORY = 'hooks';

export default async function (tree: Tree, schema: NewHookSchemaOptions) {
  const {
    name,
    importPath,
    projectLibDir,
    libFileName,
    fileName,
    projectRoot,
    libClassName,
    nxProjectName,
  } = normalizeOptions(tree, schema);

  await libraryGenerator(tree, {
    name,
    config: 'project',
    publishable: true,
    directory: DIRECTORY,
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
      joinPathFragments(projectLibDir, `${DIRECTORY}-${fileName}.${suffix}`),
      joinPathFragments(projectLibDir, `${libFileName}.${suffix}`)
    );
  });

  generateFiles(tree, joinPathFragments(__dirname, 'files'), projectRoot, {
    name,
    libFileName,
    libClassName,
    importPath,
    nxProjectName,
    tmpl: '',
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
    logger.info(` * Build the project: nx package ${nxProjectName}`);
    logger.info(` * Test the project: nx test ${nxProjectName}`);
  };
}

function normalizeOptions(tree: Tree, schema: NewHookSchemaOptions) {
  const { fileName, name, className } = names(schema.name);
  const libClassName = `${className}Hook`;
  const libFileName = `${fileName}-hook`;
  const nxProjectName = `${DIRECTORY}-${fileName}`;
  const { libsDir } = getWorkspaceLayout(tree);
  const projectRoot = joinPathFragments(libsDir, DIRECTORY, fileName);
  const importPath = `@openfeature/hooks-${fileName}`;
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

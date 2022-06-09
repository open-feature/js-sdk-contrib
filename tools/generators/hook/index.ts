import {
  Tree,
  formatFiles,
  names,
  logger,
  joinPathFragments,
  generateFiles,
  getWorkspaceLayout,
} from '@nrwl/devkit';
import { libraryGenerator } from '@nrwl/js';

interface NewHookSchemaOptions {
  name: string;
}

export default async function (tree: Tree, schema: NewHookSchemaOptions) {
  const directory = 'hooks';
  const { fileName, name, className } = names(schema.name);
  const libClassName = `${className}Hook`;
  const libFileName = `${fileName}-hook`;
  const nxProjectName = `${directory}-${fileName}`;
  const { libsDir } = getWorkspaceLayout(tree);
  const projectRoot = joinPathFragments(libsDir, directory, fileName);
  const importPath = `@openfeature/hooks-${fileName}`;
  const projectLibDir = joinPathFragments(projectRoot, 'src', 'lib');

  await libraryGenerator(tree, {
    name,
    config: 'project',
    publishable: true,
    directory,
    importPath,
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

  generateFiles(tree, joinPathFragments(__dirname, 'files'), projectRoot, {
    name,
    libFileName,
    libClassName,
    importPath,
    nxProjectName,
    tmpl: '',
  });

  await formatFiles(tree);

  return () => {
    logger.info('');
    logger.info('🎉 Success 🎉');
    logger.info('');
    logger.info('Next steps:');
    logger.info(` * View the project: ${projectRoot}`);
    logger.info(` * Build the project: nx build ${nxProjectName}`);
    logger.info(` * Test the project: nx test ${nxProjectName}`);
  };
}

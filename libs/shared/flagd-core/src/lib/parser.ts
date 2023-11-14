import Ajv from 'ajv';
import { FeatureFlag, Flag } from './feature-flag';
import mydata from '../../flagd-schemas/json/flagd-definitions.json';

const ajv = new Ajv();
const matcher = ajv.compile(mydata);

const evaluatorKey = '$evaluators';
const bracketReplacer = new RegExp('^[^{]*\\{|}[^}]*$', 'g');

/**
 * Validate and parse flag configurations.
 */
export function parse(flagCfg: string): Map<string, FeatureFlag> {
  if (!isValid(JSON.parse(flagCfg))) {
    throw new Error('invalid flagd flag configurations');
  }

  const flags: { flags: { [key: string]: Flag } } = JSON.parse(transform(flagCfg));
  const flagMap = new Map<string, FeatureFlag>();

  for (const flagsKey in flags.flags) {
    flagMap.set(flagsKey, new FeatureFlag(flags.flags[flagsKey]));
  }

  return flagMap;
}

// Transform $ref references of flagd configuration
function transform(flagCfg: string): string {
  const evaluators: { [key: string]: string } = JSON.parse(flagCfg)[evaluatorKey];

  if (!evaluators) {
    return flagCfg;
  }

  let transformed = flagCfg;

  for (const key in evaluators) {
    const replacer = JSON.stringify(evaluators[key]).replaceAll(bracketReplacer, '');
    const refRegex = new RegExp('"\\$ref":(\\s)*"' + key + '"', 'g');

    transformed = transformed.replaceAll(refRegex, replacer);
  }

  return transformed;
}

// Validate provided configuration against flagd schema
function isValid(cfg: unknown): boolean {
  const result = matcher(cfg);

  if (result) {
    return true;
  }

  return false;
}

import Ajv from 'ajv';
import { FeatureFlag, Flag } from './feature-flag';
import flagDefinitionSchema from '../../flagd-schemas/json/flagd-definitions.json';
import { ParseError } from '@openfeature/core';

const ajv = new Ajv();
const validate = ajv.compile(flagDefinitionSchema);

const evaluatorKey = '$evaluators';
const bracketReplacer = new RegExp('^[^{]*\\{|}[^}]*$', 'g');

const errorMessages = 'invalid flagd flag configuration';

/**
 * Validate and parse flag configurations.
 */
export function parse(flagCfg: string): Map<string, FeatureFlag> {
  try {
    const transformed = transform(flagCfg);
    const flags: { flags: { [key: string]: Flag } } = JSON.parse(transformed);
    const isValid = validate(flags);
    if (!isValid) {
      throw new ParseError(errorMessages);
    }
    const flagMap = new Map<string, FeatureFlag>();

    for (const flagsKey in flags.flags) {
      flagMap.set(flagsKey, new FeatureFlag(flags.flags[flagsKey]));
    }

    return flagMap;
  } catch (err) {
    if (err instanceof ParseError) {
      throw err;
    }
    throw new ParseError(errorMessages);
  }
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

import type { Logger, FlagMetadata } from '@openfeature/core';
import { ParseError } from '@openfeature/core';
import Ajv from 'ajv';
import flagsSchema from '../../flagd-schemas/json/flags.json';
import targetingSchema from '../../flagd-schemas/json/targeting.json';
import { FeatureFlag, Flag } from './feature-flag';

type FlagConfig = {
  flags: { [key: string]: Flag };
  metadata?: FlagMetadata;
};

type FlagSet = {
  flags: Map<string, FeatureFlag>;
  metadata: FlagMetadata;
};

const ajv = new Ajv({ strict: false });
const validate = ajv.addSchema(targetingSchema).compile(flagsSchema);

const evaluatorKey = '$evaluators';
const bracketReplacer = new RegExp('^[^{]*\\{|}[^}]*$', 'g');

const errorMessages = 'invalid flagd flag configuration';

/**
 * Validate and parse flag configurations.
 * @param flagConfig The flag configuration string.
 * @param strictValidation Validates against the flag and targeting schemas.
 * @param logger The logger to be used for troubleshooting.
 * @returns The parsed flag configurations.
 */
export function parse(flagConfig: string, strictValidation: boolean, logger: Logger): FlagSet {
  try {
    const transformed = transform(flagConfig);
    const parsedFlagConfig: FlagConfig = JSON.parse(transformed);

    const isValid = validate(parsedFlagConfig);
    if (!isValid) {
      const message = `${errorMessages}: ${JSON.stringify(validate.errors, undefined, 2)}`;
      if (strictValidation) {
        throw new ParseError(message);
      } else {
        logger.debug(message);
      }
    }
    const flagMap = new Map<string, FeatureFlag>();

    const flagSetMetadata = parsedFlagConfig.metadata ?? {};

    for (const flagsKey in parsedFlagConfig.flags) {
      const flag = parsedFlagConfig.flags[flagsKey];
      flagMap.set(
        flagsKey,
        new FeatureFlag(
          flagsKey,
          {
            ...flag,
            metadata: {
              ...parsedFlagConfig.metadata,
              ...flag.metadata,
            },
          },
          logger,
        ),
      );
    }

    return {
      flags: flagMap,
      metadata: flagSetMetadata,
    };
  } catch (err) {
    if (err instanceof ParseError) {
      throw err;
    }
    throw new ParseError(errorMessages, { cause: err });
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

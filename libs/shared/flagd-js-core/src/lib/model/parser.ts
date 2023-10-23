import Ajv from "ajv"
import {FlagdFlag, flagdSchema} from "./flagd-flag";

const ajv = new Ajv()
const matcher = ajv.compile(flagdSchema)

const evaluatorKey = '$evaluators'
const bracketReplacer = new RegExp('^[^{]*\\{|}[^}]*$', 'g')

/**
 * Validate and parse flag configurations.
 */
export function parse(flagCfg: string): Map<string, FlagdFlag> {
  if (!isValid(JSON.parse(flagCfg))) {
    throw new Error("invalid flagd flag configurations")
  }

  const flags: { flags: { [key: string]: FlagdFlag } } = JSON.parse(transform(flagCfg))
  const flagMap = new Map<string, FlagdFlag>();

  for (const flagsKey in flags.flags) {
    flagMap.set(flagsKey, flags.flags[flagsKey])
  }

  return flagMap;
}

function transform(flagCfg: string): string {
  const evaluators: { [key: string]: string } = JSON.parse(flagCfg)[evaluatorKey]

  if (evaluators == undefined) {
    return flagCfg
  }

  let transformed = flagCfg

  for (const key in evaluators) {
    const replacer = JSON.stringify(evaluators[key]).replaceAll(bracketReplacer, "");
    const refRegex = new RegExp('"\\$ref":(\\s)*"' + key + '"', 'g');

    transformed = transformed.replaceAll(refRegex, replacer)
  }

  return transformed
}

function isValid(cfg: any): boolean {
  const result = matcher(cfg)

  if (result) {
    return true
  }

  return false
}

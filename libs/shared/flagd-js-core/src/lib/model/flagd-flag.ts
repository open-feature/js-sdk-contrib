import {FlagValue} from "@openfeature/server-sdk";

/**
 * Flagd flag configuration structure.
 */
export class FlagdFlag {
  private readonly _state: string
  private readonly _defaultVariant: string
  private readonly _variants: Map<string, FlagValue>
  private readonly _targetingString: string

  constructor(state: string, defaultValue: string, variants: Map<string, FlagValue>, targetingString: string) {
    this._state = state;
    this._defaultVariant = defaultValue
    this._variants = variants;
    this._targetingString = targetingString;
  }

  get state(): string {
    return this._state;
  }

  get defaultVariant(): string {
    return this._defaultVariant;
  }

  get targetingString(): string {
    return this._targetingString;
  }

  get variants(): Map<string, FlagValue> {
    return this._variants;
  }
}

// flagd flag definition schema
export const flagdSchema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "flagd Flag Configuration",
  "description": "Defines flags for use in flagd, including typed variants and rules",
  "type": "object",
  "properties": {
    "flags": {
      "type": "object",
      "$comment": "flag objects are one of the 4 flag types defined in $defs",
      "additionalProperties": false,
      "patternProperties": {
        "^.{1,}$": {
          "oneOf": [
            {
              "title": "Boolean flag",
              "description": "A flag associated with boolean values",
              "$ref": "#/$defs/booleanFlag"
            },
            {
              "title": "String flag",
              "description": "A flag associated with string values",
              "$ref": "#/$defs/stringFlag"
            },
            {
              "title": "Numeric flag",
              "description": "A flag associated with numeric values",
              "$ref": "#/$defs/numberFlag"
            },
            {
              "title": "Object flag",
              "description": "A flag associated with arbitrary object values",
              "$ref": "#/$defs/objectFlag"
            }
          ]
        }
      }
    }
  },
  "$defs": {
    "flag": {
      "title": "Flag Base",
      "description": "Base object for all flags",
      "type": "object",
      "properties": {
        "state": {
          "description": "Indicates whether the flag is functional. Disabled flags are treated as if they don't exist",
          "type": "string",
          "enum": [
            "ENABLED",
            "DISABLED"
          ]
        },
        "defaultVariant": {
          "description": "The variant to serve if no dynamic targeting applies",
          "type": "string"
        },
        "targeting": {
          "type": "object",
          "description": "JsonLogic expressions to be used for dynamic evaluation. The \"context\" is passed as the data. Rules must resolve one of the defined variants, or the \"defaultVariant\" will be used."
        }
      },
      "required": [
        "state",
        "defaultVariant"
      ]
    },
    "booleanVariants": {
      "type": "object",
      "properties": {
        "variants": {
          "type": "object",
          "additionalProperties": false,
          "patternProperties": {
            "^.{1,}$": {
              "type": "boolean"
            }
          },
          "default": {
            "on": true,
            "off": false
          }
        }
      }
    },
    "stringVariants": {
      "type": "object",
      "properties": {
        "variants": {
          "type": "object",
          "additionalProperties": false,
          "patternProperties": {
            "^.{1,}$": {
              "type": "string"
            }
          }
        }
      }
    },
    "numberVariants": {
      "type": "object",
      "properties": {
        "variants": {
          "type": "object",
          "additionalProperties": false,
          "patternProperties": {
            "^.{1,}$": {
              "type": "number"
            }
          }
        }
      }
    },
    "objectVariants": {
      "type": "object",
      "properties": {
        "variants": {
          "type": "object",
          "additionalProperties": false,
          "patternProperties": {
            "^.{1,}$": {
              "type": "object"
            }
          }
        }
      }
    },
    "$comment": "Merge the variants with the base flag to build our typed flags",
    "booleanFlag": {
      "allOf": [
        {
          "$ref": "#/$defs/flag"
        },
        {
          "$ref": "#/$defs/booleanVariants"
        }
      ]
    },
    "stringFlag": {
      "allOf": [
        {
          "$ref": "#/$defs/flag"
        },
        {
          "$ref": "#/$defs/stringVariants"
        }
      ]
    },
    "numberFlag": {
      "allOf": [
        {
          "$ref": "#/$defs/flag"
        },
        {
          "$ref": "#/$defs/numberVariants"
        }
      ]
    },
    "objectFlag": {
      "allOf": [
        {
          "$ref": "#/$defs/flag"
        },
        {
          "$ref": "#/$defs/objectVariants"
        }
      ]
    }
  }
}

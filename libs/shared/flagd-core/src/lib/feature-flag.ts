import type {
  FlagValue,
  FlagMetadata,
  ResolutionDetails,
  JsonValue,
  Logger,
  ResolutionReason,
  EvaluationContext,
} from '@openfeature/core';
import { ParseError, StandardResolutionReasons, GeneralError, TypeMismatchError } from '@openfeature/core';
import { sha1 } from 'object-hash';
import { Targeting } from './targeting/targeting';

/**
 * Flagd flag configuration structure mapping to schema definition.
 */
export interface Flag {
  state: 'ENABLED' | 'DISABLED';
  defaultVariant: string;
  variants: { [key: string]: FlagValue };
  targeting?: string;
  metadata?: FlagMetadata;
}

type ResolutionDetailsWithFlagMetadata<T> = Required<Pick<ResolutionDetails<T>, 'flagMetadata'>> & ResolutionDetails<T>;

/**
 * Flagd flag configuration structure for internal reference.
 */
export class FeatureFlag {
  private readonly _key: string;
  private readonly _state: 'ENABLED' | 'DISABLED';
  private readonly _defaultVariant: string;
  private readonly _variants: Map<string, FlagValue>;
  private readonly _hash: string;
  private readonly _metadata: FlagMetadata;
  private readonly _targeting?: Targeting;
  private readonly _targetingParseError?: Error;

  constructor(key: string, flag: Flag, logger: Logger) {
    this._key = key;
    this._state = flag['state'];
    this._defaultVariant = flag['defaultVariant'];
    this._variants = new Map<string, FlagValue>(Object.entries(flag['variants']));
    this._metadata = flag['metadata'] ?? {};

    if (flag.targeting && Object.keys(flag.targeting).length > 0) {
      try {
        this._targeting = new Targeting(flag.targeting, logger);
      } catch (err) {
        const message = `Invalid targeting configuration for flag '${key}'`;
        logger.warn(message);
        this._targetingParseError = new ParseError(message, { cause: err });
      }
    }
    this._hash = sha1(flag);

    this.validateStructure();
  }

  get key(): string {
    return this._key;
  }

  get hash(): string {
    return this._hash;
  }

  get state(): string {
    return this._state;
  }

  get defaultVariant(): string {
    return this._defaultVariant;
  }

  get variants(): Map<string, FlagValue> {
    return this._variants;
  }

  get metadata(): FlagMetadata {
    return this._metadata;
  }

  evaluate(evalCtx: EvaluationContext): ResolutionDetailsWithFlagMetadata<JsonValue> {
    let variant: string;
    let reason: ResolutionReason;

    if (this._targetingParseError) {
      throw this._targetingParseError;
    } else if (!this._targeting) {
      variant = this._defaultVariant;
      reason = StandardResolutionReasons.STATIC;
    } else {
      let targetingResolution: JsonValue;
      try {
        targetingResolution = this._targeting.evaluate(this._key, evalCtx);
      } catch (e) {
        throw new GeneralError(`Error evaluating targeting rule for flag '${this._key}'`, { cause: e });
      }

      // Return default variant if targeting resolution is null or undefined
      if (targetingResolution === null || targetingResolution === undefined) {
        variant = this._defaultVariant;
        reason = StandardResolutionReasons.DEFAULT;
      } else {
        // Obtain resolution in string. This is useful for short-circuiting json logic
        variant = targetingResolution.toString();
        reason = StandardResolutionReasons.TARGETING_MATCH;
      }
    }

    if (typeof variant !== 'string') {
      throw new TypeMismatchError(`Variant must be a string, but found '${typeof variant}'`);
    }

    const resolvedVariant = this._variants.get(variant);
    if (resolvedVariant === undefined) {
      throw new GeneralError(`Variant '${variant}' not found in flag with key '${this._key}'`);
    }

    return {
      value: resolvedVariant,
      reason,
      variant,
      flagMetadata: this.metadata,
    };
  }

  validateStructure() {
    // basic validation, ideally this sort of thing is caught by IDEs and other schema validation before we get here
    // consistent with Java/Go and other implementations, we only warn for schema validation, but we fail for this sort of basic structural errors
    if (this._state !== 'ENABLED' && this._state !== 'DISABLED') {
      throw new ParseError(`Invalid flag state: ${JSON.stringify(this._state, undefined, 2)}`);
    }
    if (this._defaultVariant === undefined) {
      // this can be falsy, and int, etc...
      throw new ParseError(`Invalid flag defaultVariant: ${JSON.stringify(this._defaultVariant, undefined, 2)}`);
    }
    if (!this._variants.has(this._defaultVariant)) {
      throw new ParseError(
        `Default variant ${this._defaultVariant} missing from variants ${JSON.stringify(this._variants, undefined, 2)}`,
      );
    }
  }
}

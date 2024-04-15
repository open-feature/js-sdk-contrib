import { FlagValue, ParseError } from '@openfeature/core';
import { sha1 } from 'object-hash';

/**
 * Flagd flag configuration structure mapping to schema definition.
 */
export interface Flag {
  state: 'ENABLED' | 'DISABLED';
  defaultVariant: string;
  variants: { [key: string]: FlagValue };
  targeting?: string;
}

/**
 * Flagd flag configuration structure for internal reference.
 */
export class FeatureFlag {
  private readonly _state: 'ENABLED' | 'DISABLED';
  private readonly _defaultVariant: string;
  private readonly _variants: Map<string, FlagValue>;
  private readonly _targeting: unknown;
  private readonly _hash: string;

  constructor(flag: Flag) {
    this._state = flag['state'];
    this._defaultVariant = flag['defaultVariant'];
    this._variants = new Map<string, FlagValue>(Object.entries(flag['variants']));
    this._targeting = flag['targeting'];
    this._hash = sha1(flag);
    this.validateStructure();
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

  get targeting(): unknown {
    return this._targeting;
  }

  get variants(): Map<string, FlagValue> {
    return this._variants;
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

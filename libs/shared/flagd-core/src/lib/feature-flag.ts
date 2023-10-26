import {FlagValue} from '@openfeature/server-sdk';

/**
 * Flagd flag configuration structure mapping to schema definition.
 */
export interface Flag {
  state: string,
  defaultVariant: string,
  variants: {[key: string]: FlagValue},
  targeting: string
}

/**
 * Flagd flag configuration structure for internal reference.
 */
export class FeatureFlag {
  private readonly _state: string;
  private readonly _defaultVariant: string;
  private readonly _variants: Map<string, FlagValue>;
  private readonly _targetingString: string;

  constructor(flag: Flag) {
    this._state = flag['state'];
    this._defaultVariant = flag['defaultVariant'];
    this._variants = new Map<string, FlagValue>(Object.entries(flag['variants']));
    this._targetingString = JSON.stringify(flag['targeting']);
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
    return this._variants
  }
}

import {FlagValue} from '@openfeature/core';

/**
 * Flagd flag configuration structure mapping to schema definition.
 */
export interface Flag {
  state: string,
  defaultVariant: string,
  variants: { [key: string]: FlagValue },
  targeting: string
}

/**
 * Flagd flag configuration structure for internal reference.
 */
export class FeatureFlag {
  private readonly _state: string;
  private readonly _defaultVariant: string;
  private readonly _variants: Map<string, FlagValue>;
  private readonly _targeting: unknown;

  constructor(flag: Flag) {
    this._state = flag['state'];
    this._defaultVariant = flag['defaultVariant'];
    this._variants = new Map<string, FlagValue>(Object.entries(flag['variants']));
    this._targeting = flag['targeting'];
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
}

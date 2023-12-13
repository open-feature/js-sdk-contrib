import { FeatureFlag } from './feature-flag';
import { parse } from './parser';

/**
 * The simple contract of the storage layer.
 */
export interface Storage {
  /**
   * Sets the configurations from the given string.
   * @param cfg The configuration string to be parsed and stored.
   * @throws {Error} If the configuration string is invalid.
   */
  setConfigurations(cfg: string): void;

  /**
   * Gets the feature flag configuration with the given key.
   * @param key The key of the flag to be retrieved.
   * @returns The flag with the given key or undefined if not found.
   */
  getFlag(key: string): FeatureFlag | undefined;

  /**
   * Gets all the feature flag configurations.
   * @returns The map of all the flags.
   */
  getFlags(): Map<string, FeatureFlag>;
}

/**
 * An implementation of storage contract backed by maps.
 */
export class MemoryStorage implements Storage {
  private _flags: Map<string, FeatureFlag>;

  constructor() {
    this._flags = new Map<string, FeatureFlag>();
  }

  getFlag(key: string): FeatureFlag | undefined {
    return this._flags.get(key);
  }

  getFlags(): Map<string, FeatureFlag> {
    return this._flags;
  }

  setConfigurations(cfg: string): void {
    this._flags = parse(cfg);
  }
}

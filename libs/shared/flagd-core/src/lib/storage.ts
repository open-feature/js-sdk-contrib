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
   * Updates the configurations and returns the list of flags that have changed.
   * @param cfg The configuration string to be parsed and stored.
   * @returns The list of flags that have changed.
   * @throws {Error} If the configuration string is invalid.
   */
  updateConfigurations(cfg: string): string[];

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

  updateConfigurations(cfg: string): string[] {
    const newFlags = parse(cfg);
    const oldFlags = this._flags;
    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];

    newFlags.forEach((value, key) => {
      if (!oldFlags.has(key)) {
        added.push(key);
      } else if (oldFlags.get(key)?.hash !== value.hash) {
        changed.push(key);
      }
    });

    oldFlags.forEach((_, key) => {
      if (!newFlags.has(key)) {
        removed.push(key);
      }
    });

    this._flags = newFlags;
    return [...added, ...removed, ...changed];
  }
}

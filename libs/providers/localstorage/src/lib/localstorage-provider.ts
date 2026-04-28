import {
  type JsonValue,
  type Provider,
  type ResolutionDetails,
  ClientProviderEvents,
  FlagNotFoundError,
  OpenFeatureEventEmitter,
  ParseError,
  StandardResolutionReasons,
} from '@openfeature/web-sdk';

export type Config = {
  /**
   * Prefix to use when mapping localStorage keys to flag keys.
   * This allows you to avoid potential naming conflicts with other data in localStorage.
   *
   * @default 'openfeature.'
   */
  prefix?: string;
};

export class LocalStorageProvider implements Provider {
  metadata = {
    name: 'localStorage',
  };

  readonly runsOn = 'client';
  readonly events = new OpenFeatureEventEmitter();

  private readonly options: Config;

  constructor(options: Partial<Config> = {}) {
    this.options = {
      prefix: 'openfeature.',
      ...options,
    };
  }

  hooks = [];

  resolveBooleanEvaluation(flagKey: string): ResolutionDetails<boolean> {
    return this.evaluateLocalStorage(flagKey, (value) => {
      switch (value) {
        case 'true':
          return true;
        case 'false':
          return false;
        default:
          throw new ParseError(`Unable to cast '${value}' to a boolean`);
      }
    });
  }

  resolveStringEvaluation(flagKey: string): ResolutionDetails<string> {
    return this.evaluateLocalStorage(flagKey, (value) => value);
  }

  resolveNumberEvaluation(flagKey: string): ResolutionDetails<number> {
    return this.evaluateLocalStorage(flagKey, (value) => {
      const result = Number.parseFloat(value);
      if (Number.isNaN(result)) {
        throw new ParseError(`'${value}' is not a number`);
      }
      return result;
    });
  }

  resolveObjectEvaluation<U extends JsonValue>(flagKey: string): ResolutionDetails<U> {
    return this.evaluateLocalStorage(flagKey, (value) => {
      try {
        return JSON.parse(value);
      } catch (e) {
        throw new ParseError(`Unable to parse '${value}' as JSON`);
      }
    });
  }

  /**
   * Sets the values of flags in localStorage.
   *
   * Pass a value of `undefined` to remove a flag from localStorage.
   *
   * To store a string value to be resolved as an object, ensure the string is already JSON stringified.
   *
   * @param flags
   */
  setFlags(flags: Record<string, JsonValue | undefined>): void {
    for (const [flagKey, value] of Object.entries(flags)) {
      const localStorageKey = `${this.options.prefix ?? ''}${flagKey}`;
      if (value === undefined) {
        localStorage.removeItem(localStorageKey);
      } else {
        switch (typeof value) {
          case 'object':
            localStorage.setItem(localStorageKey, JSON.stringify(value));
            break;
          case 'string':
            localStorage.setItem(localStorageKey, value);
            break;
          case 'number':
          case 'boolean':
            localStorage.setItem(localStorageKey, value.toString());
            break;
          default:
            throw new ParseError(`Unsupported value type '${typeof value}' for key '${flagKey}'`);
        }
      }
    }

    this.events?.emit(ClientProviderEvents.ConfigurationChanged, {
      message: 'Flags updated',
      flagsChanged: Object.keys(flags),
    });
  }

  /**
   * Removes all flags from localStorage that match the provider's prefix.
   */
  clearFlags(): void {
    const flagKeys = this.enumerateLocalStorage();

    for (const flagKey of flagKeys) {
      localStorage.removeItem(`${this.options.prefix ?? ''}${flagKey}`);
    }

    this.events?.emit(ClientProviderEvents.ConfigurationChanged, {
      message: 'Flags updated',
      flagsChanged: flagKeys,
    });
  }

  /**
   * Lists all flags in localStorage that match the provider's prefix with their raw string values.
   */
  getFlags(): Record<string, string> {
    if (typeof localStorage === 'undefined') {
      return {};
    }

    const flagKeys = this.enumerateLocalStorage();
    const flags: Record<string, string> = {};

    for (const flagKey of flagKeys) {
      const value = localStorage.getItem(`${this.options.prefix ?? ''}${flagKey}`);
      if (value !== null) {
        flags[flagKey] = value;
      }
    }

    return flags;
  }

  private enumerateLocalStorage(): string[] {
    const flagKeys: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const localStorageKey = localStorage.key(i);
      if (localStorageKey !== null && localStorageKey.startsWith(this.options.prefix ?? '')) {
        flagKeys.push(localStorageKey.slice(this.options.prefix?.length));
      }
    }

    return flagKeys;
  }

  private evaluateLocalStorage<T extends JsonValue>(
    flagKey: string,
    parse: (value: string) => T,
  ): ResolutionDetails<T> {
    const localStorageKey = `${this.options.prefix ?? ''}${flagKey}`;
    const value = typeof localStorage !== 'undefined' ? localStorage.getItem(localStorageKey) : null;

    if (value === null) {
      throw new FlagNotFoundError(`Unable to find a localStorage entry with the key '${localStorageKey}'`);
    }

    try {
      const parsedValue = parse(value);

      return {
        value: parsedValue,
        reason: StandardResolutionReasons.STATIC,
      };
    } catch (err) {
      if (err instanceof ParseError) {
        throw err;
      }
      const errorMessage = err instanceof Error ? err.message : 'unknown parsing error';
      throw new ParseError(errorMessage);
    }
  }
}

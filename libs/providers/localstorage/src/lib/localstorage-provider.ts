import {
  type JsonValue,
  type Provider,
  type ResolutionDetails,
  FlagNotFoundError,
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

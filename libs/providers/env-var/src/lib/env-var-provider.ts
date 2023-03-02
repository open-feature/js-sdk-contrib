import {
  FlagNotFoundError,
  JsonValue,
  ParseError,
  Provider,
  ResolutionDetails,
  StandardResolutionReasons,
} from '@openfeature/js-sdk';
import { constantCase } from './constant-case';

export type Config = {
  /**
   * Transforms the flag key to upper case with an underscore between words. This
   * makes it easier to work with
   *
   * @example is-banner-enabled => IS_BANNER_ENABLED
   *
   * @default false
   */
  disableConstantCase: boolean;
};

export class EnvVarProvider implements Provider {
  metadata = {
    name: 'environment variable',
  };

  private readonly options: Config;

  // use the constructor for provider-specific configuration
  constructor(options: Partial<Config> = {}) {
    this.options = {
      disableConstantCase: false,
      ...options,
    };
  }

  async resolveBooleanEvaluation(flagKey: string): Promise<ResolutionDetails<boolean>> {
    return this.evaluateEnvironmentVariable(flagKey, (value) => {
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

  async resolveStringEvaluation(flagKey: string): Promise<ResolutionDetails<string>> {
    return this.evaluateEnvironmentVariable(flagKey, (value) => value);
  }

  async resolveNumberEvaluation(flagKey: string): Promise<ResolutionDetails<number>> {
    return this.evaluateEnvironmentVariable(flagKey, (value) => {
      const result = Number.parseFloat(value);
      if (Number.isNaN(result)) {
        throw new ParseError(`'${value}' is not a number`);
      }
      return result;
    });
  }

  async resolveObjectEvaluation<U extends JsonValue>(flagKey: string): Promise<ResolutionDetails<U>> {
    return this.evaluateEnvironmentVariable(flagKey, (value) => {
      try {
        return JSON.parse(value);
      } catch (e) {
        throw new ParseError(`Unable to parse '${value}' as JSON`);
      }
    });
  }

  private evaluateEnvironmentVariable<T extends JsonValue>(
    key: string,
    parse: (value: string) => T
  ): ResolutionDetails<T> {
    const envVarKey = this.options.disableConstantCase ? key : constantCase(key);
    const value = process.env[envVarKey];

    if (!value) {
      throw new FlagNotFoundError(`Unable to find an environment variable with the key '${envVarKey}'`);
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
      throw new ParseError();
    }
  }
}

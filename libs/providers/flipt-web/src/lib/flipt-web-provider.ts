import {
  EvaluationContext,
  Provider,
  JsonValue,
  ResolutionDetails,
  Logger,
  ProviderStatus,
  StandardResolutionReasons,
  ErrorCode,
  TypeMismatchError,
  GeneralError,
  ProviderFatalError,
} from '@openfeature/web-sdk';
import { FliptEvaluationClient } from '@flipt-io/flipt-client-browser';
import { EvaluationReason, FliptWebProviderOptions } from './models';
import { transformContext } from './context-transformer';

export class FliptWebProvider implements Provider {
  metadata = {
    name: FliptWebProvider.name,
  };

  // logger is the Open Feature logger to use
  private _logger?: Logger;

  // namespace is the namespace to use for the evaluation
  private _namespace: string;

  // options is the options provided to the provider
  private _options?: FliptWebProviderOptions;

  // client is the Flipt client reference
  private _client?: FliptEvaluationClient;

  readonly runsOn = 'client';

  hooks = [];

  constructor(namespace = 'default', options?: FliptWebProviderOptions, logger?: Logger) {
    this._namespace = namespace;
    this._options = options;
    this._logger = logger;
  }

  async initialize(context?: EvaluationContext | undefined): Promise<void> {
    return Promise.all([this.initializeClient()]).then(() => {
      this._logger?.info('FliptWebProvider initialized');
    });
  }

  async initializeClient() {
    let authentication = {};

    if (this._options?.authentication && 'clientToken' in this._options.authentication) {
      authentication = { client_token: this._options.authentication.clientToken };
    } else if (this._options?.authentication && 'jwtToken' in this._options.authentication) {
      authentication = { jwt_token: this._options.authentication.jwtToken };
    }

    try {
      this._client = await FliptEvaluationClient.init(this._namespace || 'default', {
        url: this._options?.url || 'http://localhost:8080',
        fetcher: this._options?.fetcher,
        authentication,
      });
    } catch (e) {
      throw new ProviderFatalError(getErrorMessage(e));
    }
  }

  async onContextChange(_oldContext: EvaluationContext, newContext: EvaluationContext): Promise<void> {
    await this._client?.refresh();
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
  ): ResolutionDetails<boolean> {
    const evalContext: Record<string, string> = transformContext(context);

    try {
      const resp = this._client?.evaluateBoolean(flagKey, context.targetingKey ?? '', evalContext);

      if (resp?.status === 'failure') {
        throw new GeneralError(resp.error_message);
      }

      const result = resp?.result;

      switch (result?.reason) {
        case EvaluationReason.DEFAULT:
          return {
            value: result?.enabled,
            reason: StandardResolutionReasons.TARGETING_MATCH,
          };
        case EvaluationReason.MATCH:
          return {
            value: result?.enabled,
            reason: StandardResolutionReasons.TARGETING_MATCH,
          };
        case EvaluationReason.UNKNOWN:
          return {
            value: defaultValue,
            reason: StandardResolutionReasons.UNKNOWN,
          };
        default:
          return {
            value: defaultValue,
            reason: StandardResolutionReasons.DEFAULT,
          };
      }
    } catch (e) {
      throw new GeneralError(getErrorMessage(e));
    }
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
  ): ResolutionDetails<string> {
    const value = this.resolveFlagHelper(flagKey, 'string', defaultValue, context);
    return value as ResolutionDetails<string>;
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
  ): ResolutionDetails<number> {
    const value = this.resolveFlagHelper(flagKey, 'number', defaultValue, context);
    return value as ResolutionDetails<number>;
  }

  resolveObjectEvaluation<U extends JsonValue>(
    flagKey: string,
    defaultValue: U,
    context: EvaluationContext,
  ): ResolutionDetails<U> {
    const value = this.resolveFlagHelper(flagKey, 'json', defaultValue, context);
    return value as ResolutionDetails<U>;
  }

  private resolveFlagHelper<U extends JsonValue>(
    flagKey: string,
    flagType: PrimitiveTypeName,
    defaultValue: PrimitiveType | U,
    context: EvaluationContext,
  ): ResolutionDetails<PrimitiveType | U> {
    const evalContext: Record<string, string> = transformContext(context);

    try {
      const resp = this._client?.evaluateVariant(flagKey, context.targetingKey ?? '', evalContext);

      if (resp?.status === 'failure') {
        throw new GeneralError(resp.error_message);
      }

      const result = resp?.result;

      if (result?.reason === EvaluationReason.FLAG_DISABLED) {
        return {
          value: defaultValue,
          reason: StandardResolutionReasons.DISABLED,
        };
      }

      if (!result?.match) {
        return {
          value: defaultValue,
          reason: StandardResolutionReasons.DEFAULT,
        };
      }

      const flagValue: PrimitiveType | U = validateFlagType(
        flagType,
        flagType === 'json' ? result.variant_attachment : result.variant_key,
      );

      return {
        value: flagValue,
        reason: StandardResolutionReasons.TARGETING_MATCH,
      };
    } catch (e) {
      if (e instanceof TypeMismatchError) {
        throw e;
      }

      throw new GeneralError(getErrorMessage(e));
    }
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

type PrimitiveType = string | number;
type PrimitiveTypeName = 'string' | 'number' | 'json';

function validateFlagType<T extends PrimitiveTypeName, U extends JsonValue>(type: T, value: string): PrimitiveType | U {
  if (typeof value !== 'undefined') {
    switch (type) {
      case 'number': {
        const actualValue = parseFloat(value);
        if (!isNaN(actualValue)) {
          return actualValue;
        }

        throw new TypeMismatchError(`flag value does not match type ${type}`);
      }
      case 'string':
        return value;
      case 'json': {
        try {
          const obj: U = JSON.parse(value);
          return obj;
        } catch {
          throw new TypeMismatchError(`flag value does not match type ${type}`);
        }
      }
      default:
        return value;
    }
  }

  return value;
}

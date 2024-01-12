import { AuthenticationStrategy, FliptClient } from '@flipt-io/flipt';
import {
  EvaluationContext,
  Provider,
  JsonValue,
  ResolutionDetails,
  ProviderStatus,
  ProviderMetadata,
  TypeMismatchError,
  StandardResolutionReasons,
  GeneralError,
} from '@openfeature/server-sdk';
import { transformContext } from './context-transformer';

export interface FliptClientParameters {
  url: string;
  authenticationStrategy?: AuthenticationStrategy;
}

export class FliptProvider implements Provider {
  readonly metadata: ProviderMetadata = {
    name: 'flipt-client-provider',
  };

  private clientParameters: FliptClientParameters;
  private namespace?: string;
  private _client?: FliptClient;

  private _status: ProviderStatus = ProviderStatus.NOT_READY;

  constructor(namespace: string, clientParameters: FliptClientParameters) {
    this.clientParameters = clientParameters;
    this.namespace = namespace;
  }

  set status(status: ProviderStatus) {
    this._status = status;
  }

  private set client(client: FliptClient) {
    this._client = client;
  }

  get status() {
    return this._status;
  }

  private get client(): FliptClient {
    if (!this._client) {
      throw new GeneralError('Provider is not initialized');
    }
    return this._client;
  }

  async initialize(): Promise<void> {
    this.client = new FliptClient({
      url: this.clientParameters.url,
      authenticationStrategy: this.clientParameters.authenticationStrategy,
    });
    this.status = ProviderStatus.READY;
  }

  async resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<boolean>> {
    const evalContext: Record<string, string> = transformContext(context);

    try {
      const booleanEvaluation = await this._client?.evaluation.boolean({
        namespaceKey: this.namespace ?? 'default',
        flagKey,
        entityId: context.targetingKey ?? '',
        context: {
          ...evalContext,
        },
      });

      switch (booleanEvaluation?.reason) {
        case 'DEFAULT_EVALUATION_REASON':
          return {
            value: booleanEvaluation?.enabled,
            reason: StandardResolutionReasons.TARGETING_MATCH,
          };
        case 'MATCH_EVALUATION_REASON':
          return {
            value: booleanEvaluation?.enabled,
            reason: StandardResolutionReasons.TARGETING_MATCH,
          };
        case 'FLAG_DISABLED_EVALUATION_REASON':
          return {
            value: defaultValue,
            reason: StandardResolutionReasons.DISABLED,
          };
        case 'UNKNOWN_EVALUATION_REASON':
          return {
            value: defaultValue,
            reason: StandardResolutionReasons.UNKNOWN,
          };
        default:
          return {
            value: defaultValue,
            reason: StandardResolutionReasons.ERROR,
          };
      }
    } catch (e) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorMessage: getErrorMessage(e),
      };
    }
  }

  async resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<string>> {
    let value = await this.resolveFlagHelper(flagKey, 'string', defaultValue, context);
    return value as ResolutionDetails<string>;
  }

  async resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<number>> {
    let value = await this.resolveFlagHelper(flagKey, 'number', defaultValue, context);
    return value as ResolutionDetails<number>;
  }

  async resolveObjectEvaluation<U extends JsonValue>(
    flagKey: string,
    defaultValue: U,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<U>> {
    let value = await this.resolveFlagHelper(flagKey, 'json', defaultValue, context);
    return value as ResolutionDetails<U>;
  }

  private async resolveFlagHelper<U extends JsonValue>(
    flagKey: string,
    flagType: PrimitiveTypeName,
    defaultValue: PrimitiveType | U,
    context: EvaluationContext,
  ): Promise<ResolutionDetails<PrimitiveType | U>> {
    const evalContext: Record<string, string> = transformContext(context);

    try {
      const variantEvaluation = await this.client?.evaluation.variant({
        namespaceKey: this.namespace ?? 'default',
        flagKey,
        entityId: context.targetingKey ?? '',
        context: {
          ...evalContext,
        },
      });

      if (variantEvaluation.reason === 'FLAG_DISABLED_EVALUATION_REASON') {
        return {
          value: defaultValue,
          reason: StandardResolutionReasons.DISABLED,
        };
      }

      if (!variantEvaluation.match) {
        return {
          value: defaultValue,
          reason: StandardResolutionReasons.DEFAULT,
        };
      }

      const flagValue: PrimitiveType | U = validateFlagType(flagType, variantEvaluation?.variantKey);

      return {
        value: flagValue,
        reason: StandardResolutionReasons.TARGETING_MATCH,
      };
    } catch (e) {
      return {
        value: defaultValue,
        reason: StandardResolutionReasons.ERROR,
        errorMessage: getErrorMessage(e),
      };
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
      case 'number':
        const actualValue = parseFloat(value);
        if (!isNaN(actualValue)) {
          return actualValue;
        }
        throw new TypeMismatchError(`flag value does not match type ${type}`);
      case 'string':
        return value;
      case 'json':
        try {
          const obj: U = JSON.parse(value);
          return obj;
        } catch {
          throw new TypeMismatchError(`flag value does not match type ${type}`);
        }
      default:
        return value;
    }
  }

  return value;
}

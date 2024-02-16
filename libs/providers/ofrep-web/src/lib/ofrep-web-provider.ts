import {
  EvaluationContext,
  FlagNotFoundError,
  FlagValue,
  JsonValue,
  Provider,
  ProviderStatus,
  ResolutionDetails,
  StandardResolutionReasons,
  TypeMismatchError,
} from '@openfeature/web-sdk';
import { EvaluateResponse } from './model/evaluate_response';
import { OfrepWebProviderOptions } from './model/options';

export class OfrepWebProvider implements Provider {
  // endpoint of your OFREP instance
  private readonly _endpoint: string;
  // _inMemoryCache is the in memory representation of all the flag evaluations.
  private _inMemoryCache: { [key: string]: ResolutionDetails<FlagValue> } = {};
  // _options is the options used to configure the provider.
  private readonly _options?: OfrepWebProviderOptions;

  // _flags is the list of flags that are being evaluated, if empty, it means that flag management system
  // is in charge of selecting which flag should be evaluated.
  private readonly _flags: string[] = [];

  public status = ProviderStatus.NOT_READY;
  constructor(ofrepEndpoint: string, flagsToEvaluate: string[], options?: OfrepWebProviderOptions) {
    this._endpoint = ofrepEndpoint;
    this._flags = flagsToEvaluate;
    this._options = options;
  }

  metadata = {
    name: OfrepWebProvider.name,
  };

  readonly runsOn = 'client';
  hooks = [];

  async initialize(context: EvaluationContext): Promise<void> {
    await this.fetchFlagEvaluation(context);
    this.status = ProviderStatus.READY;
  }

  async onContextChange(oldContext: EvaluationContext, newContext: EvaluationContext): Promise<void> {
    if (oldContext === newContext) {
      // if nothing change in the context, we don't need to do anything
      return;
    }
    this.status = ProviderStatus.STALE;
    await this.fetchFlagEvaluation(newContext);
    this.status = ProviderStatus.READY;
  }

  resolveBooleanEvaluation(flagKey: string, _: boolean): ResolutionDetails<boolean> {
    return this.evaluate(flagKey, 'boolean');
  }

  resolveStringEvaluation(flagKey: string, _: string): ResolutionDetails<string> {
    return this.evaluate(flagKey, 'string');
  }

  resolveNumberEvaluation(flagKey: string, _: number): ResolutionDetails<number> {
    return this.evaluate(flagKey, 'number');
  }

  resolveObjectEvaluation<U extends JsonValue>(flagKey: string, _: U): ResolutionDetails<U> {
    return this.evaluate(flagKey, 'object');
  }

  private async fetchFlagEvaluation(context: EvaluationContext) {
    const endpointURL = new URL(this._endpoint);

    const path = 'v1/evaluate';
    endpointURL.pathname = endpointURL.pathname.endsWith('/')
      ? endpointURL.pathname + path
      : endpointURL.pathname + '/' + path;

    const headers = new Headers({
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
    if (this._options?.bearerToken) {
      headers.set('Authorization', `Bearer ${this._options?.bearerToken}`);
    }
    if (this._options?.apiKeyAuth) {
      headers.set('X-API-Key', `${this._options?.apiKeyAuth}`);
    }

    const request = {
      context: context,
      flags: this._flags,
    };

    const init: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(request),
    };
    const response = await fetch(endpointURL.toString(), init);

    if (!response?.ok) {
      // TODO: throw a proper error
      console.error('Error fetching flags', response);
      // throw new FetchError(response.status);
    }

    const data = (await response.json()) as EvaluateResponse;
    // In case we are in success
    data.forEach((evaluationResp) => {
      if (evaluationResp.errorCode === undefined) {
        this._inMemoryCache[evaluationResp.key] = {
          value: evaluationResp.value,
          variant: evaluationResp.variant,
          errorCode: evaluationResp.errorCode,
          flagMetadata: evaluationResp.metadata,
          reason: evaluationResp.reason,
        };
      } else {
        this._options?.logger?.error(
          `ignoring flag "${evaluationResp.key}" because got the error: ${evaluationResp.errorCode} - ${evaluationResp.errorDetails}`,
        );
      }
    });
  }

  private evaluate<T extends FlagValue>(flagKey: string, type: string): ResolutionDetails<T> {
    const resolved = this._inMemoryCache[flagKey];
    if (!resolved) {
      throw new FlagNotFoundError(`flag key ${flagKey} not found in cache`);
    }

    if (typeof resolved.value !== type) {
      throw new TypeMismatchError(`flag key ${flagKey} is not of type ${type}`);
    }
    return {
      variant: resolved.variant,
      value: resolved.value as T,
      flagMetadata: resolved.flagMetadata,
      errorCode: resolved.errorCode,
      errorMessage: resolved.errorMessage,
      reason: StandardResolutionReasons.CACHED,
    };
  }
}

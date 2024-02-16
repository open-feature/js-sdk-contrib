import {
  ErrorCode,
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
import { EvaluateResponse } from './model/evaluate-response';
import { OfrepWebProviderOptions } from './model/options';
import { InMemoryCacheEntry } from './model/in-memory-cache-entry';
import { FlagChangesResponse } from './model/flag-changes-response';

export class OfrepWebProvider implements Provider {
  // endpoint of your OFREP instance
  private readonly _headers: Headers;
  private readonly _evaluateEndpoint: string;
  private readonly _flagChangeEndpoint: string;
  // _inMemoryCache is the in memory representation of all the flag evaluations.
  private _inMemoryCache: { [key: string]: InMemoryCacheEntry<FlagValue> } = {};
  // _options is the options used to configure the provider.
  private readonly _options?: OfrepWebProviderOptions;
  // _evaluationContext is the evaluation context used to evaluate the flags.
  private _evaluationContext: EvaluationContext = {};

  // _flags is the list of flags that are being evaluated, if empty, it means that flag management system
  // is in charge of selecting which flag should be evaluated.
  private readonly _flags: string[] = [];

  public status = ProviderStatus.NOT_READY;

  constructor(ofrepEndpoint: string, flagsToEvaluate: string[], options?: OfrepWebProviderOptions) {
    this._flags = flagsToEvaluate;
    this._options = options;
    this._headers = this.initHTTPHeaders();
    this._evaluateEndpoint = this.initEndpointURL(ofrepEndpoint, 'v1/evaluate').toString();
    this._flagChangeEndpoint = this.initEndpointURL(ofrepEndpoint, 'v1/flag/changes').toString();
  }

  metadata = {
    name: OfrepWebProvider.name,
  };

  readonly runsOn = 'client';
  hooks = [];

  async initialize(context: EvaluationContext): Promise<void> {
    this._evaluationContext = context;
    const evaluateResp = await this.fetchFlagEvaluation(context, this._flags);
    this.setInMemoryCache(evaluateResp ?? []);

    if (this._options?.changePropagationStrategy === 'POLLING') {
      const interval = this._options?.pollingOptions?.interval || 10000;
      setInterval(async () => await this.refreshFlags(), interval);
    }
    this.status = ProviderStatus.READY;
  }

  async onContextChange(oldContext: EvaluationContext, newContext: EvaluationContext): Promise<void> {
    if (oldContext === newContext) {
      // if nothing change in the context, we don't need to do anything
      return;
    }
    this.status = ProviderStatus.STALE;
    this._evaluationContext = newContext;
    const evaluationResp = await this.fetchFlagEvaluation(newContext, this._flags);
    this.setInMemoryCache(evaluationResp ?? []);
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

  private async fetchFlagEvaluation(context: EvaluationContext, flags: string[] = []): Promise<EvaluateResponse> {
    const requestBody = {
      context: context,
      flags: flags,
    };

    const request: RequestInit = {
      method: 'POST',
      headers: this._headers,
      body: JSON.stringify(requestBody),
    };
    const response = await fetch(this._evaluateEndpoint, request);

    if (!response?.ok) {
      // TODO: throw a custom error
      throw new Error('Error fetching flags');
      // throw new FetchError(response.status);
    }
    const data = (await response.json()) as EvaluateResponse;
    return data;
  }

  private setInMemoryCache(evaluateResp: EvaluateResponse): void {
    evaluateResp.forEach((evaluationResp) => {
      if (evaluationResp.errorCode === undefined) {
        this._inMemoryCache[evaluationResp.key] = {
          value: evaluationResp.value,
          variant: evaluationResp.variant,
          errorCode: evaluationResp.errorCode,
          flagMetadata: evaluationResp.metadata,
          reason: evaluationResp.reason,
          ETag: evaluationResp.ETag,
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

  private async fetchFlagChanges() {
    const requestBody = {
      flags: this._flags,
    };

    const request: RequestInit = {
      method: 'POST',
      headers: this._headers,
      body: JSON.stringify(requestBody),
    };
    const response = await fetch(this._flagChangeEndpoint, request);

    if (!response?.ok) {
      // TODO: throw a custom error
      throw new Error('Error fetching changes');
      // throw new FetchError(response.status);
    }
    return (await response.json()) as FlagChangesResponse;
  }

  private async refreshFlags() {
    const flagChanges = await this.fetchFlagChanges();
    const flagsToEvaluate = flagChanges
      .filter((flagChange) => {
        if (flagChange.errorCode !== undefined) {
          if (this._inMemoryCache[flagChange.key] && flagChange.errorCode === ErrorCode.FLAG_NOT_FOUND) {
            delete this._inMemoryCache[flagChange.key];
            return false;
          }
          // TODO: log something here
          return false;
        }

        // TODO: what to do with other errorCode ?
        return flagChange.ETag !== this._inMemoryCache[flagChange.key].ETag;
      })
      .map((flagChange) => flagChange.key);

    if (flagsToEvaluate.length > 0) {
      this.status = ProviderStatus.STALE;
      const evaluationResp = await this.fetchFlagEvaluation(this._evaluationContext, flagsToEvaluate);
      this.setInMemoryCache(evaluationResp ?? []);
      this.status = ProviderStatus.READY;
    }
  }

  private initHTTPHeaders(): Headers {
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
    return headers;
  }

  private initEndpointURL(baseEndpoint: string, path: string): URL {
    const endpointURL = new URL(baseEndpoint);
    endpointURL.pathname = endpointURL.pathname.endsWith('/')
      ? endpointURL.pathname + path
      : endpointURL.pathname + '/' + path;
    return endpointURL;
  }
}

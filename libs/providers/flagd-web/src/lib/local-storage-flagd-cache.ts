import { EvaluationContext, FlagValue, Logger, ResolutionDetails, StandardResolutionReasons } from '@openfeature/js-sdk';
import { Md5 } from 'ts-md5';
import { FlagdCache } from './flagd-cache';

type CacheItem<T = FlagValue> = {
  expiry: number;
  details: ResolutionDetails<T>;
  variant: string;
};

const STORAGE_PREFIX = '@OpenFeature/flagd-';
const STORAGE_SEPARATOR = '--';
const DEFAULT_OPTIONS = {
  expiryCheckInterval: 60000,
  itemTtl: 300,
};

export interface Options {
  expiryCheckInterval: number;
  itemTtl: number;
}

function getOptions(options: Partial<Options> = {}) {
  return {
    ...DEFAULT_OPTIONS,
    ...options,
  };
}

export class LocalStorageFlagdCache implements FlagdCache {
  private _ttl: number | undefined;

  constructor(options?: Partial<Options>, private _logger?: Logger) {
    const defaultedOptions = getOptions(options);
    this._ttl = defaultedOptions.itemTtl === 0 ? undefined : defaultedOptions.itemTtl;
    setInterval(() => {
      const currentTimestamp = new Date().getTime();

      Object.entries(localStorage).forEach((each) => {
        if (each[0].startsWith(STORAGE_PREFIX)) {
          const item: CacheItem = JSON.parse(each[1]);
          if (currentTimestamp > item.expiry) {
            localStorage.removeItem(each[0]);
          }
        }
      });
    }, defaultedOptions.expiryCheckInterval);
  }

  private buildKey(flagKey: string, context: EvaluationContext) {
    return `${STORAGE_PREFIX}${flagKey}${STORAGE_SEPARATOR}${Md5.hashStr(JSON.stringify(context))}`;
  }

  set<T extends FlagValue>(key: string, context: EvaluationContext, details: ResolutionDetails<T>): Promise<void> {
    const cacheKey = this.buildKey(key, context);
    const stringifiedItem = JSON.stringify({
      expiry: this._ttl ? new Date(new Date().getTime() + this._ttl).getTime() : undefined,
      details: { ...details, reason: StandardResolutionReasons.CACHED }
    });
    localStorage.setItem(
      cacheKey,
      stringifiedItem
    );
    this._logger?.debug(`${LocalStorageFlagdCache.name}: set item ${key}:${stringifiedItem}`);
    return Promise.resolve();
  }

  get<T extends FlagValue>(key: string, context: EvaluationContext): Promise<ResolutionDetails<T> | undefined> {
    const cacheKey = this.buildKey(key, context);
    const item = this.getItem<T>(cacheKey); 
    if (item) {
      this._logger?.debug(`${LocalStorageFlagdCache.name}: got item ${key}:${JSON.stringify(item)}`);
    }
    return Promise.resolve(item?.details);
  }

  del(key: string, context: EvaluationContext): Promise<void> {
    const cacheKey = this.buildKey(key, context);
    this._logger?.debug(`${LocalStorageFlagdCache.name}: deleting item ${key}`);
    return Promise.resolve(localStorage.removeItem(cacheKey));
  }

  flush(flagKey?: string): Promise<void> {
    const prefix = flagKey ? `${STORAGE_PREFIX}${flagKey}` : STORAGE_PREFIX;
    this._logger?.debug(`${LocalStorageFlagdCache.name}: flushing items prefixed with ${prefix}`);
    this.entries().forEach(entry => {
      if (entry[0].startsWith(prefix)) {
        localStorage.removeItem(entry[0]);
      }
    });
    return Promise.resolve();
  }

  private entries() {
    return Object.entries(localStorage);
  }

  private getItem<T extends FlagValue>(key: string): CacheItem<T> | undefined {
    const itemString = localStorage.getItem(key);
    if (itemString) {
      const item: CacheItem<T> = JSON.parse(itemString);
      return item;
    }
    return;
  }
}

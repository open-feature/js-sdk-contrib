import { ResolutionDetails } from '@openfeature/core';
import { LRUCacheOpts } from './types';
import { LRUCache } from 'lru-cache';

export class Cache {
  private cache: LRUCache<string, ResolutionDetails<any>>;
  private ttl: number;
  private enabled: boolean;
  constructor(opts: LRUCacheOpts) {
    this.cache = new LRUCache({
      maxSize: opts.size,
      sizeCalculation: () => 1,
    });
    this.ttl = opts.ttl;
    this.enabled = opts.enabled;
  }

  get(key: string): ResolutionDetails<any> | undefined {
    if (!this.enabled) {
      return undefined;
    }
    return this.cache.get(key);
  }

  set(key: string, value: ResolutionDetails<any>): void {
    if (!this.enabled) {
      return;
    }
    this.cache.set(key, value);
  }
}

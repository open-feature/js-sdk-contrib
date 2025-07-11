import type { ResolutionDetails } from '@openfeature/core';
import type { LRUCacheConfig } from './types';
import { LRUCache } from 'lru-cache';

export class Cache {
  private cache: LRUCache<string, ResolutionDetails<any>>;
  private ttl: number;
  private enabled: boolean;
  constructor(opts: LRUCacheConfig) {
    this.cache = new LRUCache({
      maxSize: opts.size ?? 1000,
      sizeCalculation: () => 1,
    });
    this.ttl = opts.ttl ?? 300000;
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
    this.cache.set(key, value, { ttl: this.ttl });
  }

  clear() {
    if (!this.enabled) {
      return;
    }
    this.cache.clear();
  }
}

import type { Logger } from '@openfeature/web-sdk';
import type { FlagCache } from '../model/in-memory-cache';
import type { CacheMode } from '../model/ofrep-web-provider-options';

const SCHEMA_VERSION = 1;
const STORAGE_NS = 'ofrep-web-provider';

/**
 * The envelope written to localStorage for each persisted bulk evaluation.
 * Bump SCHEMA_VERSION when this shape changes so stale entries are discarded safely.
 */
export interface PersistedEntry {
  /** Schema version — used to discard entries written by older provider versions. */
  version: number;
  /** SHA-256 hex digest (truncated to 16 chars) of `targetingKey` (or `cacheKeyPrefix + ":" + targetingKey` when configured). */
  cacheKeyHash: string;
  /** ETag returned by the server for this evaluation, used for efficient revalidation. */
  etag: string | null;
  /** ISO 8601 timestamp of when this entry was written — used for TTL enforcement. */
  writtenAt: string;
  /** The bulk evaluation payload. */
  data: FlagCache;
}

export class Storage {
  private readonly _disabled: boolean;
  private readonly _cacheKeyPrefix?: string;
  private readonly _logger?: Logger;

  constructor(cacheMode: CacheMode = 'local-cache-first', cacheKeyPrefix?: string, logger?: Logger) {
    this._disabled = cacheMode === 'disabled';
    this._cacheKeyPrefix = cacheKeyPrefix;
    this._logger = logger;
  }

  get disabled(): boolean {
    return this._disabled;
  }

  /**
   * Computes a SHA-256 hash (truncated to 16 hex chars) of the targeting key,
   * including the cacheKeyPrefix when set.
   */
  private async _hashInput(targetingKey: string): Promise<string> {
    const input = this._cacheKeyPrefix ? `${this._cacheKeyPrefix}:${targetingKey}` : targetingKey;
    const encoded = new TextEncoder().encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 16);
  }

  /**
   * Returns the localStorage key for the given targeting key.
   * Format: `ofrep-web-provider:v{version}:{hash}`
   */
  async getStorageKey(targetingKey: string): Promise<string> {
    return `${STORAGE_NS}:v${SCHEMA_VERSION}:${await this._hashInput(targetingKey)}`;
  }

  /**
   * Persists the flag cache alongside its ETag and a write timestamp.
   * No-op when cacheMode is 'disabled'. Storage write failures are logged and swallowed
   * so the provider continues operating with the fresh in-memory values.
   */
  async store(targetingKey: string, flags: FlagCache, etag: string | null): Promise<void> {
    if (this._disabled) return;
    const key = await this.getStorageKey(targetingKey);
    const entry: PersistedEntry = {
      version: SCHEMA_VERSION,
      cacheKeyHash: await this._hashInput(targetingKey),
      etag,
      writtenAt: new Date().toISOString(),
      data: flags,
    };
    try {
      localStorage.setItem(key, JSON.stringify(entry));
    } catch (error) {
      this._logger?.error(`Error storing flag cache in local storage: ${error}`);
    }
  }

  /**
   * Loads a previously persisted entry.
   * Returns `undefined` when:
   *  - cacheMode is 'disabled'
   *  - no entry exists for this targeting key
   *  - the schema version does not match
   *  - the entry is older than `ttlSeconds` (expired entries are removed from storage)
   */
  async retrieve(
    targetingKey: string,
    ttlSeconds: number,
  ): Promise<{ flags: FlagCache; etag: string | null } | undefined> {
    if (this._disabled) return undefined;
    try {
      const raw = localStorage.getItem(await this.getStorageKey(targetingKey));
      if (!raw) return undefined;

      const entry = JSON.parse(raw) as PersistedEntry;

      // Discard entries from a different schema version.
      if (entry.version !== SCHEMA_VERSION) return undefined;

      // Enforce TTL — treat expired entries as a cache miss and evict them.
      const writtenAt = new Date(entry.writtenAt).getTime();
      if (Number.isNaN(writtenAt) || Date.now() - writtenAt > ttlSeconds * 1000) {
        await this.clear(targetingKey);
        return undefined;
      }

      return { flags: entry.data, etag: entry.etag };
    } catch (error) {
      this._logger?.error(`Error retrieving flag cache from local storage: ${error}`);
      return undefined;
    }
  }

  /**
   * Removes the persisted entry for the given targeting key.
   * No-op when cacheMode is 'disabled'.
   */
  async clear(targetingKey: string): Promise<void> {
    if (this._disabled) return;
    try {
      localStorage.removeItem(await this.getStorageKey(targetingKey));
    } catch (error) {
      this._logger?.error(`Error clearing flag cache from local storage: ${error}`);
    }
  }
}

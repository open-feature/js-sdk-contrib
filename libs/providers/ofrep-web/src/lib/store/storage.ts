import type { EventStream } from '@openfeature/ofrep-core';
import type { Logger } from '@openfeature/web-sdk';
import type { FlagCache } from '../model/in-memory-cache';
import type { CacheMode } from '../model/ofrep-web-provider-options';
import { encodeCacheKeyInput } from './cache-key';

const SCHEMA_VERSION = 2;
const STORAGE_NS = 'ofrep-web-provider';

/**
 * The envelope written to localStorage for each persisted bulk evaluation.
 * Bump SCHEMA_VERSION when this shape changes so stale entries are discarded safely.
 */
export interface PersistedEntry {
  /** Schema version — used to discard entries written by older provider versions. */
  version: number;
  /** Hex digest (16 chars) of the ADR-0009 cache key input. SHA-256 when crypto.subtle is available, FNV-1a fallback otherwise. */
  cacheKeyHash: string;
  /** ETag returned by the server for this evaluation, used for efficient revalidation. */
  etag: string | null;
  /** ISO 8601 timestamp of when this entry was written — used for TTL enforcement. */
  writtenAt: string;
  /** The bulk evaluation payload. */
  data: FlagCache;
  /** Persisted flag-set metadata returned by the bulk evaluation response. */
  metadata?: Record<string, unknown>;
  /** SSE event streams returned by the bulk evaluation response (ADR-0008). Only sent on a 200, so persisting them lets SSE reconnect after a cache load or 304. */
  eventStreams?: EventStream[];
}

export class Storage {
  private readonly _disabled: boolean;
  private readonly _baseUrl: string;
  private readonly _getAuthCredential: () => Promise<string>;
  private readonly _cacheKeyPrefix?: string;
  private readonly _logger?: Logger;
  private _domain = '';

  constructor(
    cacheMode: CacheMode = 'local-cache-first',
    baseUrl: string,
    getAuthCredential: () => Promise<string>,
    cacheKeyPrefix?: string,
    logger?: Logger,
  ) {
    this._disabled = cacheMode === 'disabled';
    this._baseUrl = baseUrl;
    this._getAuthCredential = getAuthCredential;
    this._cacheKeyPrefix = cacheKeyPrefix;
    this._logger = logger;
  }

  get disabled(): boolean {
    return this._disabled;
  }

  /**
   * Sets the bound OpenFeature domain for cache key derivation.
   * Called once from provider initialization.
   */
  setDomain(domain?: string): void {
    this._domain = domain ?? '';
  }

  /**
   * Hashes the ADR-0009 cache key input to a 16-char hex string.
   * Uses SHA-256 via crypto.subtle when available (secure contexts).
   * Falls back to a double-pass FNV-1a-32 in non-secure contexts where crypto.subtle is absent.
   */
  private async _hashInput(targetingKey: string): Promise<string> {
    const input = encodeCacheKeyInput({
      cacheKeyPrefix: this._cacheKeyPrefix,
      baseUrl: this._baseUrl,
      auth: await this._getAuthCredential(),
      domain: this._domain,
      targetingKey,
    });
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const encoded = new TextEncoder().encode(input);
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 16);
    }
    return this._fnvHash(input);
  }

  /**
   * Double-pass FNV-1a-32 producing a 16-char hex string.
   * Used as a fallback when crypto.subtle is unavailable (non-secure contexts).
   */
  private _fnvHash(input: string): string {
    const fnv1a32 = (str: string, offset: number): number => {
      let h = offset >>> 0;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
      return h;
    };
    const lo = fnv1a32(input, 0x811c9dc5);
    const hi = fnv1a32(input, 0x27d4eb2f);
    return lo.toString(16).padStart(8, '0') + hi.toString(16).padStart(8, '0');
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
  async store(
    targetingKey: string,
    flags: FlagCache,
    etag: string | null,
    metadata?: Record<string, unknown>,
    eventStreams?: EventStream[],
  ): Promise<void> {
    if (this._disabled) return;
    const key = await this.getStorageKey(targetingKey);
    const entry: PersistedEntry = {
      version: SCHEMA_VERSION,
      cacheKeyHash: await this._hashInput(targetingKey),
      etag,
      writtenAt: new Date().toISOString(),
      data: flags,
      ...(metadata !== undefined && { metadata }),
      ...(eventStreams !== undefined && { eventStreams }),
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
  ): Promise<
    | { flags: FlagCache; etag: string | null; metadata?: Record<string, unknown>; eventStreams?: EventStream[] }
    | undefined
  > {
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

      return { flags: entry.data, etag: entry.etag, metadata: entry.metadata, eventStreams: entry.eventStreams };
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

import type { EvaluationResponse } from '@openfeature/ofrep-core';
import { isEvaluationFailureResponse } from '@openfeature/ofrep-core';
import type { FlagCache, MetadataCache } from './in-memory-cache';

export const persistedCacheSnapshotVersion = 1;

export type PersistedCacheSnapshot = {
  version: number;
  cacheKeyHash: string;
  etag?: string | null;
  writtenAt: string;
  data: FlagCache;
  metadata?: MetadataCache;
};

export function createPersistedCacheSnapshot(
  cacheKeyHash: string,
  data: FlagCache,
  metadata?: MetadataCache,
  etag?: string | null,
): PersistedCacheSnapshot {
  return {
    version: persistedCacheSnapshotVersion,
    cacheKeyHash,
    etag: etag ?? null,
    writtenAt: new Date().toISOString(),
    data,
    metadata,
  };
}

export function serializePersistedCacheSnapshot(snapshot: PersistedCacheSnapshot): string {
  return JSON.stringify(snapshot);
}

export function deserializePersistedCacheSnapshot(value: string): PersistedCacheSnapshot | undefined {
  try {
    const parsedValue: unknown = JSON.parse(value);
    return isPersistedCacheSnapshot(parsedValue) ? parsedValue : undefined;
  } catch {
    return undefined;
  }
}

function isPersistedCacheSnapshot(value: unknown): value is PersistedCacheSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  if (value['version'] !== persistedCacheSnapshotVersion) {
    return false;
  }

  if (typeof value['cacheKeyHash'] !== 'string' || typeof value['writtenAt'] !== 'string') {
    return false;
  }

  if ('etag' in value && value['etag'] !== null && typeof value['etag'] !== 'string') {
    return false;
  }

  if (!('data' in value) || !isFlagCache(value['data'])) {
    return false;
  }

  if ('metadata' in value && value['metadata'] !== undefined && !isMetadataCache(value['metadata'])) {
    return false;
  }

  return true;
}

function isFlagCache(value: unknown): value is FlagCache {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every((entry) => isEvaluationResponse(entry));
}

function isEvaluationResponse(value: unknown): value is EvaluationResponse {
  if (!isRecord(value)) {
    return false;
  }

  if (isEvaluationFailureResponse(value)) {
    return value.errorDetails === undefined || typeof value.errorDetails === 'string';
  }

  if ('key' in value && value['key'] !== undefined && typeof value['key'] !== 'string') {
    return false;
  }

  if ('reason' in value && value['reason'] !== undefined && typeof value['reason'] !== 'string') {
    return false;
  }

  if ('variant' in value && value['variant'] !== undefined && typeof value['variant'] !== 'string') {
    return false;
  }

  if ('metadata' in value && value['metadata'] !== undefined && !isMetadataCache(value['metadata'])) {
    return false;
  }

  return true;
}

function isMetadataCache(value: unknown): value is MetadataCache {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every(
    (entry) => typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

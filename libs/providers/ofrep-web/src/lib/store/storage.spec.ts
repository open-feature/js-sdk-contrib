import type { FlagCache } from '../model/in-memory-cache';
import { Storage } from './storage';
import { StandardResolutionReasons } from '@openfeature/web-sdk';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { TEST_FLAG_METADATA } from '../../../../../shared/ofrep-core/src/test/test-constants';

const LOCAL_STORAGE_KEY_PREFIX = 'ofrep-web-provider';

describe('Storage (persistent flag cache)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('uses a versioned storage key and does not embed the raw targeting key', () => {
    const storage = new Storage(false);
    const targetingKey = 'user-pii-21640825-95e7-4335-b149-bd6881cf7875';
    const key = storage.getStorageKey(targetingKey);
    expect(key.startsWith(`${LOCAL_STORAGE_KEY_PREFIX}:v1:`)).toBe(true);
    expect(key).not.toContain(targetingKey);
  });

  it('maps different targeting keys to different storage keys', () => {
    const storage = new Storage(false);
    expect(storage.getStorageKey('a')).not.toBe(storage.getStorageKey('b'));
  });

  it('does not read or write when disableLocalCache is true', () => {
    const storage = new Storage(true);
    const cache: FlagCache = {
      'bool-flag': {
        key: 'bool-flag',
        value: true,
        metadata: TEST_FLAG_METADATA,
        reason: StandardResolutionReasons.STATIC,
      },
    };
    storage.store('any-key', cache);
    expect(localStorage.length).toBe(0);
    expect(storage.retrieve('any-key')).toBeUndefined();
  });

  it('clears the hashed entry for the given targeting key', () => {
    const storage = new Storage(false);
    const tk = 'clear-me';
    const cache: FlagCache = {
      'bool-flag': {
        key: 'bool-flag',
        value: true,
        metadata: TEST_FLAG_METADATA,
        reason: StandardResolutionReasons.STATIC,
      },
    };
    storage.store(tk, cache);
    const key = `${LOCAL_STORAGE_KEY_PREFIX}:${storage.getStorageKey(tk)}`;
    expect(localStorage.getItem(key)).not.toBeNull();
    storage.clear(tk);
    expect(localStorage.getItem(key)).toBeNull();
  });
});

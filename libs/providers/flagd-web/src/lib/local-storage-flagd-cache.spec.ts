import { StandardResolutionReasons } from '@openfeature/js-sdk';
import { LocalStorageFlagdCache } from './local-storage-flagd-cache';

describe(LocalStorageFlagdCache.name, () => {

  beforeEach(async () => {
    await cache.flush()
  })

  const cache = new LocalStorageFlagdCache();
  const context = {some: 'context'};

  describe(LocalStorageFlagdCache.prototype.set.name, () => {

    const key = '1'
    const value = 1;
    const variant = 'one';

    it('should save to localStorage with metadata', async () => {
      await cache.set(key, context, { value, variant });
      const details = await cache.get(key, context);
      expect(details?.value).toEqual(value);
      expect(details?.variant).toEqual(variant);
      expect(details?.reason).toEqual(StandardResolutionReasons.CACHED);
    });
  });

  describe(LocalStorageFlagdCache.prototype.get.name, () => {

    const key = '2'
    const value = 2;
    const variant = 'two';

    beforeEach(async () => {
      await cache.set(key, context, { value, variant });
    });

    it('should get from localStorage with metadata', async () => {
      const details = await cache.get(key, context);
      expect(details?.value).toEqual(value);
      expect(details?.variant).toEqual(variant);
      expect(details?.reason).toEqual(StandardResolutionReasons.CACHED);
    });
  });

  describe(LocalStorageFlagdCache.prototype.flush.name, () => {

    const key3 = '3'
    const value3 = 3;
    const variant3 = 'three';

    const key4 = '4'
    const value4 = 4;
    const variant4 = 'four';

    beforeEach(async () => {
      await cache.set(key3, context, { value: value3, variant: variant3 });
      await cache.set(key4, context, { value: value4, variant: variant4 });
    });

    it('should flush some', async () => {
      expect(localStorage.length).toEqual(2);
      await cache.flush(key3);
      expect(localStorage.length).toEqual(1);
    });

    it('should flush all', async () => {
      expect(localStorage.length).toEqual(2);
      await cache.flush();
      expect(localStorage.length).toEqual(0);
    });
  });

  describe(LocalStorageFlagdCache.prototype.del.name, () => {

    const key = '5'
    const value = 5;
    const variant = 'five';

    beforeEach(async () => {
      await cache.set(key, context, { value, variant });
    });

    it('should flush all ', async () => {
      expect(localStorage.length).toEqual(1);
      await cache.del(key, context);
      expect(localStorage.length).toEqual(0);
    });
  });

});
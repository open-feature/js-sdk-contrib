import { Cache } from './cache';

describe(Cache.name, () => {
  describe(Cache.prototype.get.name, () => {
    describe('when cache is disabled', () => {
      it('should return undefined', () => {
        const cache = new Cache({ enabled: false, size: 1, ttl: 1 });
        expect(cache.get('test')).toBeUndefined();
      });
    });
    describe('when cache is enabled', () => {
      describe('when key is not in cache', () => {
        it('should return undefined', () => {
          const cache = new Cache({ enabled: true, size: 1, ttl: 1 });
          expect(cache.get('test')).toBeUndefined();
        });
      });
      describe('when key is in cache', () => {
        it('should return the value', () => {
          const cache = new Cache({ enabled: true, size: 1, ttl: 1 });
          cache.set('test', { value: true, reason: 'test' });
          expect(cache.get('test')).toEqual({ value: true, reason: 'test' });
        });
      });
    });
  });
  describe(Cache.prototype.set.name, () => {
    describe('when cache is disabled', () => {
      it('should not set the value', () => {
        const spy = jest.spyOn(Cache.prototype, 'set');
        expect(spy).not.toHaveBeenCalled();
      });
    });
    describe('when cache is enabled', () => {
      it('should set the value', () => {
        const cache = new Cache({ enabled: true, size: 1, ttl: 1 });
        cache.set('test', { value: true, reason: 'test' });
        expect(cache.get('test')).toEqual({ value: true, reason: 'test' });
      });
    });
  });

  describe(Cache.prototype.clear.name, () => {
    describe('when cache is disabled', () => {
      it('should not clear the cache', () => {
        const spy = jest.spyOn(Cache.prototype, 'clear');
        expect(spy).not.toHaveBeenCalled();
      });
    });
    describe('when cache is enabled', () => {
      it('should clear the cache', () => {
        const cache = new Cache({ enabled: true, size: 1, ttl: 1 });
        cache.set('test', { value: true, reason: 'test' });
        cache.clear();
        expect(cache.get('test')).toBeUndefined();
      });
    });
  });
});

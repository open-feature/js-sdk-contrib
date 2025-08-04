import { Cache } from './cache';

describe("cache.ts - Cache", ()=>{

  let cache : Cache
  let setSpy : jest.SpyInstance

  beforeAll(()=>{
    cache = new Cache({enabled : true})
    setSpy = jest.spyOn(Cache.prototype, 'set');

  })

  it("should return undefined when cache is disabled", ()=>{
    cache = new Cache({enabled : false})
    expect(cache.get('test')).toBeUndefined();
  })

  it("should return undefined when cache is enabled but key is not cached", ()=>{
    cache = new Cache({enabled : true})
    expect(cache.get('test')).toBeUndefined();
  })


  it("should return the cached value when cache is enabled and key is in cache", ()=>{
    const cache = new Cache({ enabled: true, size: 1, ttl: 1 });
    cache.set('test', { value: true, reason: 'test' });
    expect(cache.get('test')).toEqual({ value: true, reason: 'test' });
  })

  it("should not set any value when cache is disabled", ()=>{
    expect(setSpy).not.toHaveBeenCalled();
  })

  it("should clear the cache when cache is enabled and .clear() is called", ()=>{
    const cache = new Cache({ enabled: true, size: 1, ttl: 1 });
    cache.set('test', { value: true, reason: 'test' });
    cache.clear();
    expect(cache.get('test')).toBeUndefined();
  })

  afterEach(()=>{
    cache = new Cache({enabled : true})
    jest.clearAllMocks()
  })
})


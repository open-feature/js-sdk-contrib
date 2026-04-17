import { LocalstorageProvider } from './localstorage-provider';

describe('LocalstorageProvider', () => {
  it('should be and instance of LocalstorageProvider', () => {
    expect(new LocalstorageProvider()).toBeInstanceOf(LocalstorageProvider);
  });
});

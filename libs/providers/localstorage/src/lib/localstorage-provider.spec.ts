import { LocalStorageProvider } from './localstorage-provider';

describe('LocalStorageProvider', () => {
  it('should be and instance of LocalStorageProvider', () => {
    expect(new LocalStorageProvider()).toBeInstanceOf(LocalStorageProvider);
  });
});

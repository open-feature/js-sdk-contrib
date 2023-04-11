import { BackstageProvider } from './backstage-provider';

describe('BackstageProvider', () => {
  it('should be and instance of BackstageProvider', () => {
    expect(new BackstageProvider()).toBeInstanceOf(BackstageProvider);
  });
});

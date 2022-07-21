import { FlagdProvider } from './flagd-provider';

describe('FlagdProvider', () => {
  it('should be and instance of FlagdProvider', () => {
    expect(new FlagdProvider()).toBeInstanceOf(FlagdProvider);
  });
});

import { UnleashClientProvider } from './unleash-client-provider';

describe('UnleashClientProvider', () => {
  it('should be and instance of UnleashClientProvider', () => {
    expect(new UnleashClientProvider()).toBeInstanceOf(UnleashClientProvider);
  });
});

import { InMemoryProvider } from './in-memory-provider';

describe('InMemoryProvider', () => {
  it('should be and instance of InMemoryProvider', () => {
    expect(new InMemoryProvider()).toBeInstanceOf(InMemoryProvider);
  });
});

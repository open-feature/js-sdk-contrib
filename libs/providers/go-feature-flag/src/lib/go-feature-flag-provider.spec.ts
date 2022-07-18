import { GoFeatureFlagProvider } from './go-feature-flag-provider'

describe('GoFeatureFlagProvider', () => {
  it('should be and instance of GoFeatureFlagProvider', () => {
    expect(new GoFeatureFlagProvider({
      endpoint: 'http://zzz.com'
    })).toBeInstanceOf(GoFeatureFlagProvider)
  });
});

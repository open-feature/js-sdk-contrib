import { GoFeatureFlagProvider } from './go-feature-flag-provider';
import { OpenFeature } from '@openfeature/js-sdk';

describe('GoFeatureFlagProvider', () => {
  it('XXXX', async () => {
    const flagName = 'bool_targeting_match';
    const targetingKey = 'user-key';
    const goff = new GoFeatureFlagProvider({endpoint: 'http://local.dev:1031', timeout: 0});
    OpenFeature.setProvider(goff)
    const client = OpenFeature.getClient()
    const res = await client.getBooleanDetails(flagName, false, {targetingKey})
    console.log(res)
  });
})

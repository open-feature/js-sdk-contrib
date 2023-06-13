import {OpenFeature} from '@openfeature/js-sdk';
import {GoFeatureFlagProvider} from './go-feature-flag-provider';

jest.setTimeout(1000 * 60 * 60);
it('XXX', async () => {
  const goff = new GoFeatureFlagProvider({
    endpoint: 'http://localhost:1031',
    flagCacheTTL: 3000,
    flagCacheSize: 1,
    dataFlushInterval: 1000000
  })
  OpenFeature.setProvider(goff)
  const cli = OpenFeature.getClient()
  console.log(await cli.getBooleanDetails('bool_targeting_match', false, {targetingKey: 'my-key'}))
  console.log(await cli.getBooleanDetails('bool_targeting_match', false, {targetingKey: 'my-key'}))
  await new Promise((r) => setTimeout(r, 1000));
  console.log(await cli.getBooleanDetails('bool_targeting_match', false, {targetingKey: 'my-key'}))
  console.log(await cli.getBooleanDetails('bool_targeting_match', false, {targetingKey: 'my-key'}))
  console.log(await cli.getBooleanDetails('bool_targeting_match', false, {targetingKey: 'my-key'}))
  console.log(await cli.getBooleanDetails('bool_targeting_match', false, {targetingKey: 'my-key'}))
  console.log(await cli.getBooleanDetails('bool_targeting_match', false, {targetingKey: 'my-key'}))
  await OpenFeature.close()

  // await new Promise((r) => setTimeout(r, 1000 * 60));
})

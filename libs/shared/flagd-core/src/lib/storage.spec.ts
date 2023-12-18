import { FeatureFlag } from './feature-flag';
import { MemoryStorage } from './storage';

describe('MemoryStorage', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it('should set configurations correctly', () => {
    const cfg = '{"flags":{"flag1":{"state":"ENABLED","defaultVariant":"variant1","variants":{"variant1":true,"variant2":false}}}}';
    storage.setConfigurations(cfg);

    // Assert that the configurations are set correctly
    expect(storage['_flags']).toEqual(new Map([
      ['flag1', new FeatureFlag({ "state": "ENABLED", "defaultVariant": "variant1", "variants": { "variant1": true, "variant2": false } })],
    ]));
  });

  it('should update configurations correctly', () => {
    const flags1 = `{"flags":{"flag1":{"state":"ENABLED","defaultVariant":"variant1","variants":{"variant1":true,"variant2":false}}}}`;
    const flags2 = `{"flags":{"flag1":{"state":"ENABLED","defaultVariant":"variant1","variants":{"variant1":true,"variant2":false}},"flag2":{"state":"ENABLED","defaultVariant":"variant1","variants":{"variant1":true,"variant2":false}}}}`;
    const flags3 = `{"flags":{"flag1":{"state":"ENABLED","defaultVariant":"variant1","variants":{"variant1":true,"variant2":false},"targeting":{"if":[true,"variant1"]}},"flag2":{"state":"ENABLED","defaultVariant":"variant1","variants":{"variant1":true,"variant2":false}},"flag3":{"state":"ENABLED","defaultVariant":"variant1","variants":{"variant1":true,"variant2":false}}}}`;
    const flags4 = `{"flags":{"flag1":{"state":"ENABLED","defaultVariant":"variant1","variants":{"variant1":true,"variant2":false},"targeting":{"if":[true,"variant2"]}},"flag2":{"state":"ENABLED","defaultVariant":"variant1","variants":{"variant1":true,"variant2":false}},"flag3":{"state":"ENABLED","defaultVariant":"variant1","variants":{"variant1":true,"variant2":false}}}}`;

    storage.setConfigurations(flags1);

    expect(storage.updateConfigurations(flags2)).toEqual(['flag2']);
    expect(storage.updateConfigurations(flags3)).toEqual(['flag3', 'flag1']);
    expect(storage.updateConfigurations(flags4)).toEqual(['flag1']);
  });

  it('should get flag correctly', () => {
    const cfg = '{"flags":{"flag1":{"state":"ENABLED","defaultVariant":"variant1","variants":{"variant1":true,"variant2":false}},"flag2":{"state":"ENABLED","defaultVariant":"variant1","variants":{"variant1":true,"variant2":false}}}}';
    storage.setConfigurations(cfg);

    // Assert that the correct flag is returned
    expect(storage.getFlag('flag1')).toEqual(new FeatureFlag({ "state": "ENABLED", "defaultVariant": "variant1", "variants": { "variant1": true, "variant2": false } }));
    expect(storage.getFlag('flag2')).toEqual(new FeatureFlag({ "state": "ENABLED", "defaultVariant": "variant1", "variants": { "variant1": true, "variant2": false } }));

    // Assert that undefined is returned for non-existing flag
    expect(storage.getFlag('flag3')).toBeUndefined();
  });
});

import type { Logger } from '@openfeature/core';
import { FeatureFlag } from './feature-flag';
import { MemoryStorage } from './storage';

const logger: Logger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

describe('MemoryStorage', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage(logger);
  });

  it('should set configurations correctly', () => {
    const cfg =
      '{"flags":{"flag1":{"state":"ENABLED","defaultVariant":"variant1","variants":{"variant1":true,"variant2":false}}}}';
    storage.setConfigurations(cfg);

    // Assert that the configurations are set correctly
    expect(storage['_flags']).toEqual(
      new Map([
        [
          'flag1',
          new FeatureFlag(
            'flag1',
            {
              state: 'ENABLED',
              defaultVariant: 'variant1',
              variants: { variant1: true, variant2: false },
              metadata: {},
            },
            logger,
          ),
        ],
      ]),
    );
  });

  it('should update configurations correctly', () => {
    const flags1 = `{"flags":{"flag1":{"state":"ENABLED","defaultVariant":"variant1","variants":{"variant1":true,"variant2":false}}}}`;
    const flags2 = `{"flags":{"flag1":{"state":"ENABLED","defaultVariant":"variant1","variants":{"variant1":true,"variant2":false}},"flag2":{"state":"ENABLED","defaultVariant":"variant1","variants":{"variant1":true,"variant2":false}}}}`;
    const flags3 = `{"flags":{"flag1":{"state":"ENABLED","defaultVariant":"variant1","variants":{"variant1":true,"variant2":false},"targeting":{"if":[true,"variant1"]}},"flag2":{"state":"ENABLED","defaultVariant":"variant1","variants":{"variant1":true,"variant2":false}},"flag3":{"state":"ENABLED","defaultVariant":"variant1","variants":{"variant1":true,"variant2":false}}}}`;
    const flags4 = `{"flags":{"flag1":{"state":"ENABLED","defaultVariant":"variant1","variants":{"variant1":true,"variant2":false},"targeting":{"if":[true,"variant2"]}},"flag2":{"state":"ENABLED","defaultVariant":"variant1","variants":{"variant1":true,"variant2":false}},"flag3":{"state":"ENABLED","defaultVariant":"variant1","variants":{"variant1":true,"variant2":false}}}}`;

    expect(storage.setConfigurations(flags1)).toEqual(['flag1']);
    expect(storage.setConfigurations(flags2)).toEqual(['flag2']);
    expect(storage.setConfigurations(flags3)).toEqual(['flag3', 'flag1']);
    expect(storage.setConfigurations(flags4)).toEqual(['flag1']);
  });

  it('should get flag correctly', () => {
    const cfg =
      '{"flags":{"flag1":{"state":"ENABLED","defaultVariant":"variant1","variants":{"variant1":true,"variant2":false}},"flag2":{"state":"ENABLED","defaultVariant":"variant1","variants":{"variant1":true,"variant2":false}}}}';
    storage.setConfigurations(cfg);

    // Assert that the correct flag is returned
    expect(storage.getFlag('flag1')).toEqual(
      new FeatureFlag(
        'flag1',
        { state: 'ENABLED', defaultVariant: 'variant1', variants: { variant1: true, variant2: false }, metadata: {} },
        logger,
      ),
    );
    expect(storage.getFlag('flag2')).toEqual(
      new FeatureFlag(
        'flag2',
        { state: 'ENABLED', defaultVariant: 'variant1', variants: { variant1: true, variant2: false }, metadata: {} },
        logger,
      ),
    );

    // Assert that undefined is returned for non-existing flag
    expect(storage.getFlag('flag3')).toBeUndefined();
  });

  describe('metadata', () => {
    it('should return flag set version and id, owner, and drop "random"', () => {
      const cfg =
        '{"flags":{"flag1":{"state":"ENABLED","defaultVariant":"variant1","variants":{"variant1":true,"variant2":false},"metadata":{"owner":"mike"}}}, "metadata":{"version":"1", "id": "test", "random": "shouldBeDropped"}}';
      storage.setConfigurations(cfg);
      const flag1 = storage.getFlag('flag1');

      expect(flag1?.metadata).toEqual({ flagSetVersion: '1', flagSetId: 'test', owner: 'mike' });
    });

    it('should merge metadata with flag metadata overriding matching flag set metadata', () => {
      const cfg =
        '{"flags":{"flag1":{"state":"ENABLED","defaultVariant":"variant1","variants":{"variant1":true,"variant2":false},"metadata":{"owner":"mike", "flagSetId": "prod" }}}, "metadata":{"version":"1", "id": "dev"}}';
      storage.setConfigurations(cfg);
      const flag1 = storage.getFlag('flag1');

      expect(flag1?.metadata).toEqual({ flagSetVersion: '1', flagSetId: 'prod', owner: 'mike' });
    });

    it('should set flag set metadata correctly', () => {
      const cfg =
        '{"flags":{"flag1":{"state":"ENABLED","defaultVariant":"variant1","variants":{"variant1":true,"variant2":false}}}, "metadata":{"version":"1", "id": "dev"}}';
      storage.setConfigurations(cfg);
      expect(storage.getFlagSetMetadata()).toEqual({ flagSetVersion: '1', flagSetId: 'dev' });
    });
  });
});

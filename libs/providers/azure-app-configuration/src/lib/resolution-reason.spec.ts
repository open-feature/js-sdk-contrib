import { StandardResolutionReasons } from '@openfeature/server-sdk';
import { resolveBooleanResolutionReason, resolveVariantResolutionReason } from './resolution-reason';

describe('resolution-reason', () => {
  describe('resolveBooleanResolutionReason', () => {
    it('returns STATIC for a flag that is not explicitly enabled', () => {
      expect(resolveBooleanResolutionReason({ id: 'flag', enabled: false })).toBe(StandardResolutionReasons.STATIC);
    });

    it('returns STATIC for an enabled flag without client filters', () => {
      expect(resolveBooleanResolutionReason({ id: 'flag', enabled: true })).toBe(StandardResolutionReasons.STATIC);
    });

    it('returns STATIC for an enabled flag with only non-targeting filters', () => {
      expect(
        resolveBooleanResolutionReason({
          id: 'flag',
          enabled: true,
          conditions: { client_filters: [{ name: 'Microsoft.TimeWindow' }] },
        }),
      ).toBe(StandardResolutionReasons.STATIC);
    });

    it('returns TARGETING_MATCH when a targeting filter is configured', () => {
      expect(
        resolveBooleanResolutionReason({
          id: 'flag',
          enabled: true,
          conditions: { client_filters: [{ name: 'Microsoft.Targeting' }] },
        }),
      ).toBe(StandardResolutionReasons.TARGETING_MATCH);
    });
  });

  describe('resolveVariantResolutionReason', () => {
    it('returns DEFAULT for the default variant when the flag is enabled', async () => {
      await expect(
        resolveVariantResolutionReason(
          {
            id: 'flag',
            enabled: true,
            variants: [{ name: 'Large' }],
            allocation: { default_when_enabled: 'Large' },
          },
          { userId: 'user-1' },
          true,
        ),
      ).resolves.toBe(StandardResolutionReasons.DEFAULT);
    });

    it('returns DEFAULT for the default variant when the flag is disabled', async () => {
      await expect(
        resolveVariantResolutionReason(
          {
            id: 'flag',
            enabled: false,
            variants: [{ name: 'Small' }],
            allocation: { default_when_disabled: 'Small' },
          },
          { userId: 'user-1' },
          false,
        ),
      ).resolves.toBe(StandardResolutionReasons.DEFAULT);
    });

    it('returns TARGETING_MATCH when user allocation matches', async () => {
      await expect(
        resolveVariantResolutionReason(
          {
            id: 'flag',
            enabled: true,
            variants: [{ name: 'Large' }],
            allocation: { user: [{ variant: 'Large', users: ['user-1'] }] },
          },
          { userId: 'user-1' },
          true,
        ),
      ).resolves.toBe(StandardResolutionReasons.TARGETING_MATCH);
    });

    it('returns TARGETING_MATCH when group allocation matches', async () => {
      await expect(
        resolveVariantResolutionReason(
          {
            id: 'flag',
            enabled: true,
            variants: [{ name: 'Large' }],
            allocation: { group: [{ variant: 'Large', groups: ['beta'] }] },
          },
          { userId: 'user-1', groups: ['beta'] },
          true,
        ),
      ).resolves.toBe(StandardResolutionReasons.TARGETING_MATCH);
    });
  });
});

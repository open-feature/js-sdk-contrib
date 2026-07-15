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
    it('returns DEFAULT for the default variant when the flag is enabled', () => {
      expect(
        resolveVariantResolutionReason(
          {
            id: 'flag',
            enabled: true,
            variants: [{ name: 'Large' }],
            allocation: { default_when_enabled: 'Large' },
          },
          'Large',
          true,
        ),
      ).toBe(StandardResolutionReasons.DEFAULT);
    });

    it('returns DEFAULT for the default variant when the flag is disabled', () => {
      expect(
        resolveVariantResolutionReason(
          {
            id: 'flag',
            enabled: false,
            variants: [{ name: 'Small' }],
            allocation: { default_when_disabled: 'Small' },
          },
          'Small',
          false,
        ),
      ).toBe(StandardResolutionReasons.DEFAULT);
    });

    it('returns DEFAULT when status_override disables the default_when_enabled variant', () => {
      expect(
        resolveVariantResolutionReason(
          {
            id: 'flag',
            enabled: true,
            variants: [{ name: 'Off' }],
            allocation: { default_when_enabled: 'Off' },
          },
          'Off',
          false,
        ),
      ).toBe(StandardResolutionReasons.DEFAULT);
    });

    it('returns TARGETING_MATCH when status_override disables a targeted variant', () => {
      expect(
        resolveVariantResolutionReason(
          {
            id: 'flag',
            enabled: true,
            variants: [{ name: 'On' }],
            allocation: { default_when_enabled: 'Off' },
          },
          'On',
          false,
        ),
      ).toBe(StandardResolutionReasons.TARGETING_MATCH);
    });

    it('returns TARGETING_MATCH when an enabled flag assigns a non-default variant', () => {
      expect(
        resolveVariantResolutionReason(
          {
            id: 'flag',
            enabled: true,
            variants: [{ name: 'Large' }],
            allocation: { default_when_enabled: 'Small' },
          },
          'Large',
          true,
        ),
      ).toBe(StandardResolutionReasons.TARGETING_MATCH);
    });

    it('returns TARGETING_MATCH when an enabled flag assigns a variant without a configured default', () => {
      expect(
        resolveVariantResolutionReason(
          {
            id: 'flag',
            enabled: true,
            variants: [{ name: 'Large' }],
          },
          'Large',
          true,
        ),
      ).toBe(StandardResolutionReasons.TARGETING_MATCH);
    });
  });
});

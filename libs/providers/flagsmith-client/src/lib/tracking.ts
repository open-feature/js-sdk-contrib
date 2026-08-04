import type { TrackingEventDetails } from '@openfeature/web-sdk';

/**
 * Reserved tracking-event name for recording flag/variant exposures.
 *
 * `client.track(EXPOSURE_TRACKING_EVENT, details)` routes to Flagsmith's exposure
 * tracking instead of a plain analytics event.
 *
 * @experimental Tracking is an experimental OpenFeature capability (spec §6).
 */
export const EXPOSURE_TRACKING_EVENT = 'feature_flag.exposure';

/**
 * Details shape for {@link EXPOSURE_TRACKING_EVENT} events.
 *
 * @experimental Tracking is an experimental OpenFeature capability (spec §6).
 */
export type ExposureTrackingDetails = TrackingEventDetails & {
  /** The flag whose exposure is being recorded. */
  flagKey: string;
  /**
   * The variant the user was exposed to. Omit to let the provider resolve the
   * flag and apply the SDK's guards (exists, enabled, has variant, server-sourced).
   */
  variant?: string;
};

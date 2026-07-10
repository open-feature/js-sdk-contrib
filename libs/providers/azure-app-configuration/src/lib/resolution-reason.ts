import type { ResolutionReason } from '@openfeature/server-sdk';
import { StandardResolutionReasons } from '@openfeature/server-sdk';

const TARGETING_FILTER = 'Microsoft.Targeting';

export interface FeatureFlagDefinition {
  id: string;
  enabled?: boolean;
  conditions?: {
    client_filters?: { name: string }[];
  };
  allocation?: {
    default_when_disabled?: string;
    default_when_enabled?: string;
  };
  variants?: { name: string }[];
}

// OpenFeature resolution reasons are optional telemetry, so these helpers derive a
// best-effort reason from the flag definition and the variant the underlying
// library actually assigned. We deliberately avoid re-deriving
// @microsoft/feature-management's targeting/bucketing logic to prevent drift.
export function resolveBooleanResolutionReason(featureFlag: FeatureFlagDefinition): ResolutionReason {
  if (featureFlag.enabled !== true) {
    return StandardResolutionReasons.STATIC;
  }

  const clientFilters = featureFlag.conditions?.client_filters;
  if (!clientFilters?.length) {
    return StandardResolutionReasons.STATIC;
  }

  const appliesTargeting = clientFilters.some((filter) => filter.name === TARGETING_FILTER);
  return appliesTargeting ? StandardResolutionReasons.TARGETING_MATCH : StandardResolutionReasons.STATIC;
}

export function resolveVariantResolutionReason(
  featureFlag: FeatureFlagDefinition,
  assignedVariantName: string,
  enabled: boolean,
): ResolutionReason {
  const allocation = featureFlag.allocation;

  if (!enabled) {
    // Kill-switch: flag disabled in configuration resolves via default_when_disabled.
    if (featureFlag.enabled !== true) {
      return StandardResolutionReasons.DEFAULT;
    }

    // Flag remains enabled in config; isEnabled=false comes from status_override on the assigned variant.
    if (allocation?.default_when_enabled !== undefined && assignedVariantName === allocation.default_when_enabled) {
      return StandardResolutionReasons.DEFAULT;
    }

    return StandardResolutionReasons.TARGETING_MATCH;
  }

  // Enabled and the assigned variant is the configured default => DEFAULT.
  if (allocation?.default_when_enabled !== undefined && assignedVariantName === allocation.default_when_enabled) {
    return StandardResolutionReasons.DEFAULT;
  }

  // Otherwise the library assigned the variant through a user/group/percentile allocation.
  return StandardResolutionReasons.TARGETING_MATCH;
}

import type { FeatureResult, FeatureResultSource } from '@growthbook/growthbook';
import type { ResolutionDetails, ResolutionReason } from '@openfeature/server-sdk';
import { ErrorCode, StandardResolutionReasons, TypeMismatchError } from '@openfeature/server-sdk';

const FEATURE_RESULT_ERRORS = ['unknownFeature', 'cyclicPrerequisite'];

/**
 * GrowthBook's `source` describes how a value was produced. Map it onto the
 * OpenFeature reasons so consumers -- and reason-aware tooling such as the
 * OpenTelemetry hooks -- see the same vocabulary they get from every other
 * provider. The raw source is preserved in flag metadata for anyone who needs
 * the GrowthBook-specific detail.
 */
function translateReason(source: FeatureResultSource): ResolutionReason {
  switch (source) {
    case 'experiment':
      return StandardResolutionReasons.SPLIT;
    case 'force':
      // Lossy by necessity: GrowthBook reports "force" for forced rules
      // whether or not the rule carried conditions or rollout coverage, and
      // the FeatureResult does not include the rule definition. Consumers
      // needing the distinction can read flagMetadata.source and the rule id.
      return StandardResolutionReasons.TARGETING_MATCH;
    case 'override':
      // Overrides are programmatic forces, not user targeting.
      return StandardResolutionReasons.STATIC;
    case 'prerequisite':
      // A prerequisite-blocked feature carries a null value and falls back to
      // the caller's default, which is a DEFAULT outcome, not a targeting
      // match on the caller's own attributes.
      return StandardResolutionReasons.DEFAULT;
    case 'defaultValue':
      return StandardResolutionReasons.DEFAULT;
    case 'unknownFeature':
    case 'cyclicPrerequisite':
      return StandardResolutionReasons.ERROR;
    default:
      // Not reachable for the current FeatureResultSource union, but the peer
      // range allows newer GrowthBook minors that may add sources.
      return StandardResolutionReasons.UNKNOWN;
  }
}

function translateError(errorKind?: string): ErrorCode {
  switch (errorKind) {
    case 'unknownFeature':
      return ErrorCode.FLAG_NOT_FOUND;
    case 'cyclicPrerequisite':
      return ErrorCode.PARSE_ERROR;
    default:
      return ErrorCode.GENERAL;
  }
}

export default function translateResult<T>(result: FeatureResult, defaultValue: T): ResolutionDetails<T> {
  if (result.value !== null && typeof result.value !== typeof defaultValue) {
    throw new TypeMismatchError(`Expected flag type ${typeof defaultValue} but got ${typeof result.value}`);
  }

  const resolution: ResolutionDetails<T> = {
    value: result.value === null ? defaultValue : result.value,
    reason: translateReason(result.source),
    variant: result.experimentResult?.key,
    flagMetadata: {
      source: result.source,
    },
  };

  if (FEATURE_RESULT_ERRORS.includes(result.source)) {
    resolution.errorCode = translateError(result.source);
  }

  return resolution;
}

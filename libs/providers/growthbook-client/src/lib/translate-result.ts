import { FeatureResult } from '@growthbook/growthbook';
import { ErrorCode, ResolutionDetails, TypeMismatchError } from '@openfeature/web-sdk';

const FEATURE_RESULT_ERRORS = ['unknownFeature', 'cyclicPrerequisite'];

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
    reason: result.source,
    variant: result.experimentResult?.key,
  };

  if (FEATURE_RESULT_ERRORS.includes(result.source)) {
    resolution.errorCode = translateError(result.source);
  }

  return resolution;
}

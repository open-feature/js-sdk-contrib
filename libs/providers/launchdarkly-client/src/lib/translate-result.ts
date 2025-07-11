import type { ResolutionDetails } from '@openfeature/web-sdk';
import { ErrorCode } from '@openfeature/web-sdk';
import type { LDEvaluationDetail } from 'launchdarkly-js-client-sdk';

function translateErrorKind(errorKind?: string): ErrorCode {
  // Error code specification.
  // https://github.com/open-feature/spec/blob/main/specification/sections/02-providers.md#requirement-28
  switch (errorKind) {
    case 'CLIENT_NOT_READY':
      return ErrorCode.PROVIDER_NOT_READY;
    case 'MALFORMED_FLAG':
      return ErrorCode.PARSE_ERROR;
    case 'FLAG_NOT_FOUND':
      return ErrorCode.FLAG_NOT_FOUND;
    case 'USER_NOT_SPECIFIED':
      return ErrorCode.TARGETING_KEY_MISSING;
    // General errors.
    default:
      return ErrorCode.GENERAL;
  }
}

/**
 * Translate an {@link LDEvaluationDetail} to a {@link ResolutionDetails}.
 * @param result The {@link LDEvaluationDetail} to translate.
 * @returns An equivalent {@link ResolutionDetails}.
 *
 * @internal
 */
export default function translateResult<T>(result: LDEvaluationDetail): ResolutionDetails<T> {
  const resolution: ResolutionDetails<T> = {
    value: result.value,
    variant: result.variationIndex?.toString(),
    reason: result.reason?.kind,
  };

  if (result.reason?.kind === 'ERROR') {
    resolution.errorCode = translateErrorKind(result.reason.errorKind);
  }
  return resolution;
}

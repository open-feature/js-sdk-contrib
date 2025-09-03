import type { EvaluationDetails } from '@configcat/sdk';
import { EvaluationErrorCode } from '@configcat/sdk';
import type { ResolutionDetails, ResolutionReason, JsonValue, OpenFeatureError } from '@openfeature/core';
import {
  TypeMismatchError,
  StandardResolutionReasons,
  ParseError,
  GeneralError,
  FlagNotFoundError,
  ProviderNotReadyError,
} from '@openfeature/core';

export function toResolutionDetails<T>(
  value: T,
  data: Omit<EvaluationDetails, 'value'>,
  reason?: ResolutionReason,
): ResolutionDetails<T> {
  const matchedTargeting = data.matchedTargetingRule;
  const matchedPercentage = data.matchedPercentageOption;

  const matchedRule = Boolean(matchedTargeting || matchedPercentage);
  const evaluatedReason = matchedRule ? StandardResolutionReasons.TARGETING_MATCH : StandardResolutionReasons.STATIC;

  return {
    value,
    reason: reason ?? evaluatedReason,
    errorMessage: data.errorMessage,
    variant: data.variationId ?? undefined,
  };
}

export function translateError(errorCode: Exclude<EvaluationErrorCode, EvaluationErrorCode.None>): OpenFeatureError {
  switch (errorCode) {
    case EvaluationErrorCode.InvalidConfigModel:
      return new ParseError();
    case EvaluationErrorCode.SettingValueTypeMismatch:
      return new TypeMismatchError();
    case EvaluationErrorCode.ConfigJsonNotAvailable:
      return new ProviderNotReadyError();
    case EvaluationErrorCode.SettingKeyMissing:
      return new FlagNotFoundError();
    default:
      return new GeneralError();
  }
}

export type PrimitiveTypeName = 'string' | 'boolean' | 'number' | 'object';
export type PrimitiveType<T> = T extends 'string'
  ? string
  : T extends 'boolean'
    ? boolean
    : T extends 'number'
      ? number
      : T extends 'object'
        ? JsonValue
        : never;

export function isType<T extends PrimitiveTypeName>(type: T, value: unknown): value is PrimitiveType<T> {
  switch (type) {
    case 'string':
    case 'boolean':
    case 'number':
      return typeof value === type;
    case 'object':
      return (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'boolean' ||
        typeof value === 'number' ||
        Array.isArray(value) ||
        typeof value === 'object'
      );
  }
  return false;
}

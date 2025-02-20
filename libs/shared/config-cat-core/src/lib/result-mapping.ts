import { IEvaluationDetails } from 'configcat-js-ssr';
import {
  ResolutionDetails,
  ResolutionReason,
  TypeMismatchError,
  StandardResolutionReasons,
  JsonValue,
  OpenFeatureError,
  ParseError,
  TargetingKeyMissingError,
  GeneralError,
  FlagNotFoundError,
} from '@openfeature/core';

export function toResolutionDetails<T>(
  value: T,
  data: Omit<IEvaluationDetails, 'value'>,
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

export function parseError(errorMessage: string | undefined): OpenFeatureError {
  // Detecting the error type by checking the error message is awkward and fragile,
  // but ConfigCat SDK doesn't allow a better way at the moment.
  // However, there are plans to improve this situation, so let's revise this
  // as soon as ConfigCat SDK implements returning error codes.

  if (errorMessage) {
    if (errorMessage.includes('Config JSON is not present')) {
      return new ParseError();
    }
    if (errorMessage.includes('the key was not found in config JSON')) {
      return new FlagNotFoundError();
    }
    if (
      errorMessage.includes('The type of a setting must match the type of the specified default value') ||
      /Setting value (?:is null|is undefined|'.*' is of an unsupported type)/.test(errorMessage)
    ) {
      return new TypeMismatchError();
    }
  }
  return new GeneralError();
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

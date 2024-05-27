import { IEvaluationDetails } from 'configcat-js-ssr';
import { ResolutionDetails, ResolutionReason, TypeMismatchError, StandardResolutionReasons } from '@openfeature/core';

export function toResolutionDetails<T extends PrimitiveTypeName>(
  type: T,
  value: unknown,
  data: Omit<IEvaluationDetails, 'value'>,
  reason?: ResolutionReason,
): ResolutionDetails<PrimitiveType<T>> {
  if (!isType(type, value)) {
    throw new TypeMismatchError(`Requested ${type} flag but the actual value is ${typeof value}`);
  }

  const matchedTargeting = 'matchedEvaluationRule' in data ? data.matchedEvaluationRule : data.matchedTargetingRule;
  const matchedPercentage =
    'matchedEvaluationPercentageRule' in data ? data.matchedEvaluationPercentageRule : data.matchedPercentageOption;

  const matchedRule = Boolean(matchedTargeting || matchedPercentage);
  const evaluatedReason = matchedRule ? StandardResolutionReasons.TARGETING_MATCH : StandardResolutionReasons.STATIC;

  return {
    value,
    reason: reason ?? evaluatedReason,
    errorMessage: data.errorMessage,
    variant: data.variationId ?? undefined,
  };
}

export type PrimitiveTypeName = 'string' | 'boolean' | 'number' | 'object' | 'undefined';
export type PrimitiveType<T> = T extends 'string'
  ? string
  : T extends 'boolean'
    ? boolean
    : T extends 'number'
      ? number
      : T extends 'object'
        ? object
        : T extends 'undefined'
          ? undefined
          : unknown;

export function isType<T extends PrimitiveTypeName>(type: T, value: unknown): value is PrimitiveType<T> {
  return typeof value !== 'undefined' && typeof value === type;
}

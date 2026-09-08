import type { OptimizelyDecision } from '@optimizely/optimizely-sdk';
import { GeneralError, StandardResolutionReasons, TypeMismatchError } from '@openfeature/server-sdk';
import type { JsonValue, ResolutionDetails } from '@openfeature/server-sdk';

export type EvaluationValueType = 'boolean' | 'string' | 'number' | 'object';

/**
 * Translates an Optimizely decision to an OpenFeature resolution of the
 * requested type.
 */
export function translateDecision<T extends JsonValue>(
  decision: OptimizelyDecision,
  valueType: EvaluationValueType,
): ResolutionDetails<T> {
  if (decision.variationKey === null) {
    throw new GeneralError(decision.reasons.join('; ') || 'Optimizely could not make a decision.');
  }

  const variables = Object.values(decision.variables);
  const value = getValue(variables, decision.variables, decision.enabled, valueType);

  return {
    value: value as T,
    variant: decision.variationKey,
    ...(decision.ruleKey === null ? {} : { flagMetadata: { ruleKey: decision.ruleKey } }),
    reason: decision.enabled ? StandardResolutionReasons.UNKNOWN : StandardResolutionReasons.DISABLED,
  };
}

function getValue(
  variables: unknown[],
  variablesMap: Record<string, unknown>,
  enabled: boolean,
  valueType: EvaluationValueType,
): JsonValue {
  if (variables.length === 0) {
    if (valueType === 'boolean') {
      return enabled;
    }
    throwTypeMismatch(valueType, 'a flag with no variables');
  }

  if (variables.length > 1) {
    if (valueType === 'object' && isJsonValue(variablesMap)) {
      return variablesMap;
    }
    throwTypeMismatch(valueType, 'a flag with multiple variables');
  }

  const [variable] = variables;
  if (isExpectedType(variable, valueType)) {
    return variable;
  }
  throwTypeMismatch(valueType, `a ${describeValue(variable)} variable`);
}

function isExpectedType(value: unknown, valueType: EvaluationValueType): value is JsonValue {
  switch (valueType) {
    case 'boolean':
    case 'string':
    case 'number':
      return typeof value === valueType;
    case 'object':
      return (value === null || typeof value === 'object') && isJsonValue(value);
  }
}

function isJsonValue(value: unknown, visited = new Set<object>()): value is JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'object' || visited.has(value)) {
    return false;
  }
  if (Array.isArray(value)) {
    visited.add(value);
    const isValid = value.every((item) => isJsonValue(item, visited));
    visited.delete(value);
    return isValid;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    return false;
  }
  visited.add(value);
  const isValid = Object.values(value).every((item) => isJsonValue(item, visited));
  visited.delete(value);
  return isValid;
}

function throwTypeMismatch(valueType: EvaluationValueType, actual: string): never {
  throw new TypeMismatchError(`Cannot resolve ${actual} as an OpenFeature ${valueType} value.`);
}

function describeValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}

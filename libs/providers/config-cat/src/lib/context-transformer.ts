import { EvaluationContext, EvaluationContextValue, TargetingKeyMissingError } from '@openfeature/js-sdk';
import { User as ConfigCatUser } from 'configcat-common/lib/RolloutEvaluator';

function contextValueToString(contextValue: EvaluationContextValue): string | undefined {
  if (typeof contextValue === 'string') {
    return contextValue;
  }

  if (typeof contextValue === 'boolean' || typeof contextValue === 'number' || contextValue === null) {
    return String(contextValue);
  }

  if (typeof contextValue === 'undefined') {
    return contextValue;
  }

  if (contextValue instanceof Date) {
    return contextValue.toISOString();
  }

  return JSON.stringify(contextValue);
}

function transformContextValues(contextValue: EvaluationContextValue): ConfigCatUser['custom'] | undefined {
  if (contextValue === null) {
    return undefined;
  }

  if (typeof contextValue !== 'object' || Array.isArray(contextValue)) {
    const value = contextValueToString(contextValue);
    return value ? { value } : undefined;
  }

  if (contextValue instanceof Date) {
    return { value: contextValue.toISOString() };
  }

  return Object.entries(contextValue).reduce<ConfigCatUser['custom']>((context, [key, value]) => {
    const transformedValue = contextValueToString(value);
    return transformedValue ? { ...context, [key]: transformedValue } : context;
  }, undefined);
}

function stringOrUndefined(param?: unknown): string | undefined {
  if (typeof param === 'string') {
    return param;
  }

  return undefined;
}

export function transformContext(context: EvaluationContext): ConfigCatUser | never {
  const { targetingKey, email, country, ...attributes } = context;

  if (!targetingKey) {
    throw new TargetingKeyMissingError('ConfigCat evaluation context can only be used if a targetingKey is given');
  }

  return {
    identifier: targetingKey,
    email: stringOrUndefined(email),
    country: stringOrUndefined(country),
    custom: transformContextValues(attributes),
  };
}

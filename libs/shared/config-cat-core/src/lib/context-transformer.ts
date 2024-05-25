import { EvaluationContext, EvaluationContextValue } from '@openfeature/core';
import { User as ConfigCatUser } from 'configcat-js-ssr';

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

function transformContextValues(contextValue: EvaluationContextValue): ConfigCatUser['custom'] {
  if (contextValue === null) {
    return {};
  }

  if (typeof contextValue !== 'object' || Array.isArray(contextValue)) {
    const value = contextValueToString(contextValue);
    return value ? { value } : {};
  }

  if (contextValue instanceof Date) {
    return { value: contextValue.toISOString() };
  }

  return Object.entries(contextValue).reduce<ConfigCatUser['custom']>((context, [key, value]) => {
    const transformedValue = contextValueToString(value);
    return transformedValue ? { ...context, [key]: transformedValue } : context;
  }, {});
}

function stringOrUndefined(param?: unknown): string | undefined {
  if (typeof param === 'string') {
    return param;
  }

  return undefined;
}

export function transformContext(context: EvaluationContext): ConfigCatUser | undefined {
  const { targetingKey, email, country, ...attributes } = context;

  if (!targetingKey) {
    return undefined;
  }

  return {
    identifier: targetingKey,
    email: stringOrUndefined(email),
    country: stringOrUndefined(country),
    custom: transformContextValues(attributes),
  };
}

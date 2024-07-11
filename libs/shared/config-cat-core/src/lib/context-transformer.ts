import { EvaluationContext, EvaluationContextValue } from '@openfeature/core';
import { User as ConfigCatUser, UserAttributeValue } from 'configcat-common';

function toUserAttributeValue(value: EvaluationContextValue): UserAttributeValue {
  if (typeof value === 'string' || typeof value === 'number' || value instanceof Date) {
    return value;
  } else if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return value as ReadonlyArray<string>;
  }
  return JSON.stringify(value);
}

function transformCustomContextValues(contextValue: EvaluationContextValue): ConfigCatUser['custom'] {
  if (typeof contextValue !== 'object' || contextValue === null) {
    return {};
  }

  return Object.entries(contextValue).reduce<ConfigCatUser['custom']>(
    (context, [key, value]) => {
      const transformedValue = toUserAttributeValue(value);
      return transformedValue ? { ...context, [key]: transformedValue } : context;
    },
    {} as ConfigCatUser['custom'],
  );
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
    custom: transformCustomContextValues(attributes),
  };
}

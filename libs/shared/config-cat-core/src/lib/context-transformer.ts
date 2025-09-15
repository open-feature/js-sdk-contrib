import type { EvaluationContext, EvaluationContextValue } from '@openfeature/core';
import type { IUser as ConfigCatUser, UserAttributeValue } from '@configcat/sdk';

function toUserAttributeValue(value: EvaluationContextValue): UserAttributeValue {
  // NOTE: The ConfigCat SDK doesn't support objects and non-string arrays as user attribute values
  // but we special-case these for backward compatibility.
  if (typeof value === 'object' && (!Array.isArray(value) || !value.every((item) => typeof item === 'string'))) {
    return JSON.stringify(value);
  }

  // NOTE: No need to check for unsupported attribute values as the ConfigCat SDK handles those internally.
  return value as UserAttributeValue;
}

function transformCustomContextValues(values: Record<string, EvaluationContextValue>): ConfigCatUser['custom'] {
  let attributes: ConfigCatUser['custom'];
  for (const [key, value] of Object.entries(values)) {
    if (value != null) {
      const transformedValue = toUserAttributeValue(value);
      // NOTE: No need to check for `identifier`, `email` and `country` user attributes
      // as the ConfigCat SDK ignores those as custom user attributes.
      (attributes ??= {})[key] = transformedValue;
    }
  }
  return attributes;
}

function stringOrUndefined(param?: unknown): string | undefined {
  if (typeof param === 'string') {
    return param;
  }

  return undefined;
}

export function transformContext(context: EvaluationContext): ConfigCatUser | undefined {
  const { targetingKey, email, country } = context;

  return {
    // NOTE: The ConfigCat SDK handles missing or unsupported identifier values.
    identifier: targetingKey ?? (context['identifier'] as string),
    email: stringOrUndefined(email),
    country: stringOrUndefined(country),
    custom: transformCustomContextValues(context),
  };
}

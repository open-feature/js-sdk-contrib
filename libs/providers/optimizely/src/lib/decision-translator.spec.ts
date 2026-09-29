import type { OptimizelyDecision } from '@optimizely/optimizely-sdk';
import { GeneralError, StandardResolutionReasons, TypeMismatchError } from '@openfeature/server-sdk';
import { translateDecision } from './decision-translator';

function decision(overrides: Partial<OptimizelyDecision> = {}): OptimizelyDecision {
  return {
    enabled: true,
    flagKey: 'flag-key',
    reasons: [],
    ruleKey: 'rule-key',
    userContext: {} as OptimizelyDecision['userContext'],
    variables: {},
    variationKey: 'variation-key',
    ...overrides,
  };
}

describe('translateDecision', () => {
  it('maps a flag without variables to its enabled state for a boolean evaluation', () => {
    expect(translateDecision<boolean>(decision(), 'boolean')).toEqual({
      value: true,
      variant: 'variation-key',
      flagMetadata: { ruleKey: 'rule-key' },
      reason: StandardResolutionReasons.UNKNOWN,
    });
  });

  it('uses the disabled reason while preserving the boolean enabled state', () => {
    expect(translateDecision<boolean>(decision({ enabled: false }), 'boolean')).toEqual({
      value: false,
      variant: 'variation-key',
      flagMetadata: { ruleKey: 'rule-key' },
      reason: StandardResolutionReasons.DISABLED,
    });
  });

  it.each(['string', 'number', 'object'] as const)(
    'rejects a flag without variables for a %s evaluation',
    (valueType) => {
      expect(() => translateDecision(decision(), valueType)).toThrow(TypeMismatchError);
    },
  );

  it.each([
    ['boolean', true],
    ['string', 'treatment'],
    ['number', 42],
    ['object', { theme: 'dark', quotas: [1, 2] }],
    ['object', null],
  ] as const)('maps a single matching %s variable', (valueType, value) => {
    expect(translateDecision(decision({ variables: { variable: value } }), valueType)).toEqual({
      value,
      variant: 'variation-key',
      flagMetadata: { ruleKey: 'rule-key' },
      reason: StandardResolutionReasons.UNKNOWN,
    });
  });

  it.each([
    ['boolean', 'treatment'],
    ['string', true],
    ['number', '42'],
    ['object', 'not-json-object'],
  ] as const)('rejects a single variable when it does not match the requested %s type', (valueType, value) => {
    expect(() => translateDecision(decision({ variables: { variable: value } }), valueType)).toThrow(TypeMismatchError);
  });

  it('maps multiple variables as an object evaluation', () => {
    const variables = { color: 'blue', enabled: true, settings: { retries: 3 } };

    expect(translateDecision(decision({ variables }), 'object')).toEqual({
      value: variables,
      variant: 'variation-key',
      flagMetadata: { ruleKey: 'rule-key' },
      reason: StandardResolutionReasons.UNKNOWN,
    });
  });

  it.each(['boolean', 'string', 'number'] as const)('rejects multiple variables for a %s evaluation', (valueType) => {
    expect(() => translateDecision(decision({ variables: { one: 1, two: 2 } }), valueType)).toThrow(TypeMismatchError);
  });

  it.each([{ variable: new Date('2026-09-08') }, { variable: Number.NaN }, { variable: { nested: undefined } }])(
    'rejects a single non-JSON object variable',
    (variables) => {
      expect(() => translateDecision(decision({ variables }), 'object')).toThrow(TypeMismatchError);
    },
  );

  it('rejects a multiple-variable result containing a non-JSON value', () => {
    expect(() =>
      translateDecision(decision({ variables: { valid: true, invalid: Number.POSITIVE_INFINITY } }), 'object'),
    ).toThrow(TypeMismatchError);
  });

  it('throws a GeneralError using Optimizely reasons when the variation is absent', () => {
    expect(() =>
      translateDecision(decision({ variationKey: null, reasons: ['Unknown flag key: flag-key'] }), 'boolean'),
    ).toThrow(new GeneralError('Unknown flag key: flag-key'));
  });

  it('uses a fallback GeneralError message when Optimizely provides no reasons', () => {
    expect(() => translateDecision(decision({ variationKey: null }), 'boolean')).toThrow(
      'Optimizely could not make a decision.',
    );
  });

  it('omits rule metadata when Optimizely did not select a rule', () => {
    expect(translateDecision<boolean>(decision({ ruleKey: null }), 'boolean')).toEqual({
      value: true,
      variant: 'variation-key',
      reason: StandardResolutionReasons.UNKNOWN,
    });
  });
});

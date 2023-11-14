import { FlagdCore } from './flagd-core';
import { GeneralError, StandardResolutionReasons, TypeMismatchError } from '@openfeature/core';

describe('flagd-core resolving', () => {
  const flagCfg = `{"flags":{"myBoolFlag":{"state":"ENABLED","variants":{"on":true,"off":false},"defaultVariant":"on"},"myStringFlag":{"state":"ENABLED","variants":{"key1":"val1","key2":"val2"},"defaultVariant":"key1"},"myFloatFlag":{"state":"ENABLED","variants":{"one":1.23,"two":2.34},"defaultVariant":"one"},"myIntFlag":{"state":"ENABLED","variants":{"one":1,"two":2},"defaultVariant":"one"},"myObjectFlag":{"state":"ENABLED","variants":{"object1":{"key":"val"},"object2":{"key":true}},"defaultVariant":"object1"},"fibAlgo":{"variants":{"recursive":"recursive","memo":"memo","loop":"loop","binet":"binet"},"defaultVariant":"recursive","state":"ENABLED","targeting":{"if":[{"$ref":"emailWithFaas"},"binet",null]}},"targetedFlag":{"variants":{"first":"AAA","second":"BBB","third":"CCC"},"defaultVariant":"first","state":"ENABLED","targeting":{"if":[{"in":["@openfeature.dev",{"var":"email"}]},"second",{"in":["Chrome",{"var":"userAgent"}]},"third",null]}}},"$evaluators":{"emailWithFaas":{"in":["@faas.com",{"var":["email"]}]}}}`;
  let core: FlagdCore;

  beforeAll(() => {
    core = new FlagdCore();
    core.setConfigurations(flagCfg);
  });

  it('should resolve boolean flag', () => {
    const resolved = core.resolveBooleanEvaluation('myBoolFlag', false, {}, console);
    expect(resolved.value).toBeTruthy();
    expect(resolved.reason).toBe(StandardResolutionReasons.STATIC);
    expect(resolved.variant).toBe('on');
  });

  it('should resolve string flag', () => {
    const resolved = core.resolveStringEvaluation('myStringFlag', 'key2', {}, console);
    expect(resolved.value).toBe('val1');
    expect(resolved.reason).toBe(StandardResolutionReasons.STATIC);
    expect(resolved.variant).toBe('key1');
  });

  it('should resolve number flag', () => {
    const resolved = core.resolveNumberEvaluation('myFloatFlag', 2.34, {}, console);
    expect(resolved.value).toBe(1.23);
    expect(resolved.reason).toBe(StandardResolutionReasons.STATIC);
    expect(resolved.variant).toBe('one');
  });

  it('should resolve object flag', () => {
    const resolved = core.resolveObjectEvaluation('myObjectFlag', { key: true }, {}, console);
    expect(resolved.value).toStrictEqual({ key: 'val' });
    expect(resolved.reason).toBe(StandardResolutionReasons.STATIC);
    expect(resolved.variant).toBe('object1');
  });
});

describe('flagd-core targeting evaluations', () => {
  const targetingFlag =
    '{"flags":{"targetedFlag":{"variants":{"first":"AAA","second":"BBB","third":"CCC"},"defaultVariant":"first","state":"ENABLED","targeting":{"if":[{"in":["@openfeature.dev",{"var":"email"}]},"second",null]}},"shortCircuit":{"variants":{"true":true,"false":false},"defaultVariant":"false","state":"ENABLED","targeting":{"==":[{"var":"favoriteNumber"},1]}}}}';
  let core: FlagdCore;

  beforeAll(() => {
    core = new FlagdCore();
    core.setConfigurations(targetingFlag);
  });

  it('should resolve for correct inputs', () => {
    const resolved = core.resolveStringEvaluation('targetedFlag', 'none', { email: 'admin@openfeature.dev' }, console);
    expect(resolved.value).toBe('BBB');
    expect(resolved.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
    expect(resolved.variant).toBe('second');
  });

  it('should fallback to default - missing targeting context data', () => {
    const resolved = core.resolveStringEvaluation('targetedFlag', 'none', {}, console);
    expect(resolved.value).toBe('AAA');
    expect(resolved.reason).toBe(StandardResolutionReasons.DEFAULT);
    expect(resolved.variant).toBe('first');
  });

  it('should handle short circuit fallbacks', () => {
    const resolved = core.resolveBooleanEvaluation('shortCircuit', false, { favoriteNumber: 1 }, console);
    expect(resolved.value).toBe(true);
    expect(resolved.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
    expect(resolved.variant).toBe('true');
  });
});

describe('flagd-core validations', () => {
  // flags of disabled, invalid variants and missing variant
  const mixFlags =
    '{"flags":{"myBoolFlag":{"state":"DISABLED","variants":{"on":true,"off":false},"defaultVariant":"on"},"myStringFlag":{"state":"ENABLED","variants":{"on":true,"off":false},"defaultVariant":"on"},"myIntFlag":{"state":"ENABLED","variants":{"two":2},"defaultVariant":"one"}}}';
  let core: FlagdCore;

  beforeAll(() => {
    core = new FlagdCore();
    core.setConfigurations(mixFlags);
  });

  it('should validate flag type - eval int as boolean', () => {
    expect(() => core.resolveBooleanEvaluation('myIntFlag', true, {}, console)).toThrow(GeneralError);
  });

  it('should validate flag status', () => {
    const evaluation = core.resolveBooleanEvaluation('myBoolFlag', false, {}, console);

    expect(evaluation).toBeTruthy();
    expect(evaluation.value).toBe(false);
    expect(evaluation.reason).toBe(StandardResolutionReasons.DISABLED);
  });

  it('should validate variant', () => {
    expect(() => core.resolveStringEvaluation('myStringFlag', 'hello', {}, console)).toThrow(TypeMismatchError);
  });

  it('should validate variant existence', () => {
    expect(() => core.resolveNumberEvaluation('myIntFlag', 100, {}, console)).toThrow(GeneralError);
  });
});

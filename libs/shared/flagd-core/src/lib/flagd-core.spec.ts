import { FlagdCore } from './flagd-core';
import { FlagNotFoundError, GeneralError, StandardResolutionReasons, TypeMismatchError } from '@openfeature/core';

describe('flagd-core resolving', () => {
  describe('truthy variant values', () => {
    const flagCfg = `{"flags":{"myBoolFlag":{"state":"ENABLED","variants":{"on":true,"off":false},"defaultVariant":"on"},"myStringFlag":{"state":"ENABLED","variants":{"key1":"val1","key2":"val2"},"defaultVariant":"key1"},"myFloatFlag":{"state":"ENABLED","variants":{"one":1.23,"two":2.34},"defaultVariant":"one"},"myIntFlag":{"state":"ENABLED","variants":{"one":1,"two":2},"defaultVariant":"one"},"myObjectFlag":{"state":"ENABLED","variants":{"object1":{"key":"val"},"object2":{"key":true}},"defaultVariant":"object1"},"fibAlgo":{"variants":{"recursive":"recursive","memo":"memo","loop":"loop","binet":"binet"},"defaultVariant":"recursive","state":"ENABLED","targeting":{"if":[{"$ref":"emailWithFaas"},"binet",null]}},"targetedFlag":{"variants":{"first":"AAA","second":"BBB","third":"CCC"},"defaultVariant":"first","state":"ENABLED","targeting":{"if":[{"in":["@openfeature.dev",{"var":"email"}]},"second",{"in":["Chrome",{"var":"userAgent"}]},"third",null]}}},"$evaluators":{"emailWithFaas":{"in":["@faas.com",{"var":["email"]}]}}}`;
    let core: FlagdCore;

    beforeAll(() => {
      core = new FlagdCore();
      core.setConfigurations(flagCfg);
    });

    it('should resolve boolean flag', () => {
      const resolved = core.resolveBooleanEvaluation('myBoolFlag', false, {}, console);
      expect(resolved.value).toBe(true);
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

  describe('falsy variant values', () => {
    const flagCfg = `{"flags":{"myBoolFlag":{"state":"ENABLED","variants":{"on":true,"off":false},"defaultVariant":"off"},"myStringFlag":{"state":"ENABLED","variants":{"key1":"","key2":""},"defaultVariant":"key1"},"myFloatFlag":{"state":"ENABLED","variants":{"zero":0.0,"one":1.34},"defaultVariant":"zero"},"myIntFlag":{"state":"ENABLED","variants":{"zero":0,"one":1},"defaultVariant":"zero"},"myObjectFlag":{"state":"ENABLED","variants":{"object1":{},"object2":{"key":true}},"defaultVariant":"object1"},"fibAlgo":{"variants":{"recursive":"recursive","memo":"memo","loop":"loop","binet":"binet"},"defaultVariant":"recursive","state":"ENABLED","targeting":{"if":[{"$ref":"emailWithFaas"},"binet",null]}},"targetedFlag":{"variants":{"first":"AAA","second":"BBB","third":"CCC"},"defaultVariant":"first","state":"ENABLED","targeting":{"if":[{"in":["@openfeature.dev",{"var":"email"}]},"second",{"in":["Chrome",{"var":"userAgent"}]},"third",null]}}},"$evaluators":{"emailWithFaas":{"in":["@faas.com",{"var":["email"]}]}}}`;
    let core: FlagdCore;

    beforeAll(() => {
      core = new FlagdCore();
      core.setConfigurations(flagCfg);
    });

    it('should resolve boolean flag', () => {
      const resolved = core.resolveBooleanEvaluation('myBoolFlag', false, {}, console);
      expect(resolved.value).toBe(false);
      expect(resolved.reason).toBe(StandardResolutionReasons.STATIC);
      expect(resolved.variant).toBe('off');
    });

    it('should resolve string flag', () => {
      const resolved = core.resolveStringEvaluation('myStringFlag', 'key2', {}, console);
      expect(resolved.value).toBe('');
      expect(resolved.reason).toBe(StandardResolutionReasons.STATIC);
      expect(resolved.variant).toBe('key1');
    });

    it('should resolve number flag', () => {
      const resolved = core.resolveNumberEvaluation('myFloatFlag', 2.34, {}, console);
      expect(resolved.value).toBe(0);
      expect(resolved.reason).toBe(StandardResolutionReasons.STATIC);
      expect(resolved.variant).toBe('zero');
    });

    it('should resolve object flag', () => {
      const resolved = core.resolveObjectEvaluation('myObjectFlag', { key: true }, {}, console);
      expect(resolved.value).toStrictEqual({});
      expect(resolved.reason).toBe(StandardResolutionReasons.STATIC);
      expect(resolved.variant).toBe('object1');
    });
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

  it('should match the variant "true" by casting the boolean response from the targeting evaluation', () => {
    const caseVariantValueFlag =
      '{"flags":{"new-welcome-banner":{"state":"ENABLED","variants":{"true":true,"false":false},"defaultVariant":"false","targeting":{"in":["@example.com",{"var":"email"}]}}}}';

    const core = new FlagdCore();
    core.setConfigurations(caseVariantValueFlag);

    const evaluation = core.resolveBooleanEvaluation(
      'new-welcome-banner',
      false,
      { email: 'test@example.com' },
      console,
    );
    expect(evaluation.value).toBe(true);
    expect(evaluation.variant).toBe('true');
    expect(evaluation.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
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

  it('should throw because the flag does not exist', () => {
    expect(() => core.resolveBooleanEvaluation('nonexistentFlagKey', false, {}, console)).toThrow(
      new FlagNotFoundError("flag: 'nonexistentFlagKey' not found"),
    );
  });

  it('should throw because the flag is disabled and should behave like it does not exist', () => {
    expect(() => core.resolveBooleanEvaluation('myBoolFlag', false, {}, console)).toThrow(
      new FlagNotFoundError(`flag: 'myBoolFlag' is disabled`),
    );
  });

  it('should validate variant', () => {
    expect(() => core.resolveStringEvaluation('myStringFlag', 'hello', {}, console)).toThrow(TypeMismatchError);
  });

  it('should validate variant existence', () => {
    expect(() => core.resolveNumberEvaluation('myIntFlag', 100, {}, console)).toThrow(GeneralError);
  });
});

describe('flagd-core common flag definitions', () => {
  it('should support boolean variant shorthand', () => {
    const core = new FlagdCore();
    const flagCfg = `{"flags":{"myBoolFlag":{"state":"ENABLED","variants":{"true":true,"false":false},"defaultVariant":"false", "targeting":{"in":["@openfeature.dev",{"var":"email"}]}}}}`;
    core.setConfigurations(flagCfg);

    const resolved = core.resolveBooleanEvaluation('myBoolFlag', false, { email: 'user@openfeature.dev' }, console);
    expect(resolved.value).toBe(true);
    expect(resolved.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
    expect(resolved.variant).toBe('true');
  });

  it('should support fractional logic', () => {
    const core = new FlagdCore();
    const flagCfg = `{"flags":{"headerColor":{"state":"ENABLED","variants":{"red":"red","blue":"blue","grey":"grey"},"defaultVariant":"grey", "targeting":{"fractional":[{"var":"email"},["red",50],["blue",50]]}}}}`;
    core.setConfigurations(flagCfg);

    const resolved = core.resolveStringEvaluation('headerColor', 'grey', { email: 'user@openfeature.dev' }, console);
    expect(resolved.value).toBe('red');
    expect(resolved.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
    expect(resolved.variant).toBe('red');
  });

  it('should support nested fractional logic', () => {
    const core = new FlagdCore();
    const flagCfg = `{"flags":{"headerColor":{"state":"ENABLED","variants":{"red":"red","blue":"blue","grey":"grey"},"defaultVariant":"grey", "targeting":{"if":[true,{"fractional":[{"var":"email"},["red",50],["blue",50]]}]}}}}`;
    core.setConfigurations(flagCfg);

    const resolved = core.resolveStringEvaluation('headerColor', 'grey', { email: 'user@openfeature.dev' }, console);
    expect(resolved.value).toBe('red');
    expect(resolved.reason).toBe(StandardResolutionReasons.TARGETING_MATCH);
    expect(resolved.variant).toBe('red');
  });

  it('should support empty targeting rules', () => {
    const core = new FlagdCore();
    const flagCfg = `{"flags":{"isEnabled":{"state":"ENABLED","variants":{"true":true,"false":false},"defaultVariant":"false","targeting":{}}}}`;
    core.setConfigurations(flagCfg);

    const resolved = core.resolveBooleanEvaluation('isEnabled', false, {}, console);
    expect(resolved.value).toBe(false);
    expect(resolved.reason).toBe(StandardResolutionReasons.STATIC);
    expect(resolved.variant).toBe('false');
  });
});

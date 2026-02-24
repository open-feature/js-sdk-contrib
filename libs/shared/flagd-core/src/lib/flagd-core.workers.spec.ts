/**
 * @jest-environment ./test/jest-environment-worker.js
 *
 * These tests run in a restricted environment that blocks eval() and new Function(),
 * simulating Cloudflare Workers / V8 isolate restrictions.
 *
 * They verify that flagd-core works correctly with pre-compiled AJV validators
 * in environments that block dynamic code generation.
 *
 * Note: Tests that require targeting evaluation (engine.build / engine.run) are
 * covered in the next PR that adds interpreter mode for json-logic-engine.
 */

import { ErrorCode, ParseError, StandardResolutionReasons } from '@openfeature/core';
import { FlagdCore } from './flagd-core';

describe('flagd-core (restricted environment) resolving', () => {
  describe('truthy variant values', () => {
    const flagCfg = `{"flags":{"myBoolFlag":{"state":"ENABLED","variants":{"on":true,"off":false},"defaultVariant":"on"},"myStringFlag":{"state":"ENABLED","variants":{"key1":"val1","key2":"val2"},"defaultVariant":"key1"},"myFloatFlag":{"state":"ENABLED","variants":{"one":1.23,"two":2.34},"defaultVariant":"one"},"myIntFlag":{"state":"ENABLED","variants":{"one":1,"two":2},"defaultVariant":"one"},"myObjectFlag":{"state":"ENABLED","variants":{"object1":{"key":"val"},"object2":{"key":true}},"defaultVariant":"object1"}}}`;
    let core: FlagdCore;

    beforeAll(() => {
      core = new FlagdCore();
      core.setConfigurations(flagCfg);
    });

    it('should resolve boolean flag', () => {
      const resolved = core.resolveBooleanEvaluation('myBoolFlag', false, {});
      expect(resolved.value).toBe(true);
      expect(resolved.reason).toBe(StandardResolutionReasons.STATIC);
      expect(resolved.variant).toBe('on');
    });

    it('should resolve string flag', () => {
      const resolved = core.resolveStringEvaluation('myStringFlag', 'key2', {});
      expect(resolved.value).toBe('val1');
      expect(resolved.reason).toBe(StandardResolutionReasons.STATIC);
      expect(resolved.variant).toBe('key1');
    });

    it('should resolve number flag', () => {
      const resolved = core.resolveNumberEvaluation('myFloatFlag', 2.34, {});
      expect(resolved.value).toBe(1.23);
      expect(resolved.reason).toBe(StandardResolutionReasons.STATIC);
      expect(resolved.variant).toBe('one');
    });

    it('should resolve object flag', () => {
      const resolved = core.resolveObjectEvaluation('myObjectFlag', { key: true }, {});
      expect(resolved.value).toStrictEqual({ key: 'val' });
      expect(resolved.reason).toBe(StandardResolutionReasons.STATIC);
      expect(resolved.variant).toBe('object1');
    });
  });

  describe('falsy variant values', () => {
    const flagCfg = `{"flags":{"myBoolFlag":{"state":"ENABLED","variants":{"on":true,"off":false},"defaultVariant":"off"},"myStringFlag":{"state":"ENABLED","variants":{"key1":"","key2":""},"defaultVariant":"key1"},"myFloatFlag":{"state":"ENABLED","variants":{"zero":0.0,"one":1.34},"defaultVariant":"zero"},"myIntFlag":{"state":"ENABLED","variants":{"zero":0,"one":1},"defaultVariant":"zero"},"myObjectFlag":{"state":"ENABLED","variants":{"object1":{},"object2":{"key":true}},"defaultVariant":"object1"}}}`;
    let core: FlagdCore;

    beforeAll(() => {
      core = new FlagdCore();
      core.setConfigurations(flagCfg);
    });

    it('should resolve boolean flag', () => {
      const resolved = core.resolveBooleanEvaluation('myBoolFlag', true, {});
      expect(resolved.value).toBe(false);
      expect(resolved.reason).toBe(StandardResolutionReasons.STATIC);
      expect(resolved.variant).toBe('off');
    });

    it('should resolve string flag', () => {
      const resolved = core.resolveStringEvaluation('myStringFlag', 'key2', {});
      expect(resolved.value).toBe('');
      expect(resolved.reason).toBe(StandardResolutionReasons.STATIC);
      expect(resolved.variant).toBe('key1');
    });

    it('should resolve number flag', () => {
      const resolved = core.resolveNumberEvaluation('myFloatFlag', 2.34, {});
      expect(resolved.value).toBe(0);
      expect(resolved.reason).toBe(StandardResolutionReasons.STATIC);
      expect(resolved.variant).toBe('zero');
    });

    it('should resolve object flag', () => {
      const resolved = core.resolveObjectEvaluation('myObjectFlag', { key: true }, {});
      expect(resolved.value).toStrictEqual({});
      expect(resolved.reason).toBe(StandardResolutionReasons.STATIC);
      expect(resolved.variant).toBe('object1');
    });
  });
});

describe('flagd-core (restricted environment) validations', () => {
  const mixFlags =
    '{"flags":{"disabledFlag":{"state":"DISABLED","variants":{"on":true,"off":false},"defaultVariant":"on"},"myStringFlag":{"state":"ENABLED","variants":{"on":true,"off":false},"defaultVariant":"on"}}}';
  let core: FlagdCore;

  beforeAll(() => {
    core = new FlagdCore();
    core.setConfigurations(mixFlags);
  });

  it('should return reason "error" because the flag does not exist', () => {
    const flagKey = 'nonexistentFlagKey';
    const evaluation = core.resolveBooleanEvaluation(flagKey, false, {});
    expect(evaluation.reason).toBe(StandardResolutionReasons.ERROR);
    expect(evaluation.errorCode).toBe(ErrorCode.FLAG_NOT_FOUND);
    expect(evaluation.errorMessage).toBe(`flag '${flagKey}' not found`);
    expect(evaluation.value).toBe(false);
    expect(evaluation.variant).toBeUndefined();
  });

  it('should return reason "error" because the flag is disabled', () => {
    const flagKey = 'disabledFlag';
    const evaluation = core.resolveBooleanEvaluation(flagKey, false, {});
    expect(evaluation.reason).toBe(StandardResolutionReasons.ERROR);
    expect(evaluation.errorCode).toBe(ErrorCode.FLAG_NOT_FOUND);
    expect(evaluation.errorMessage).toBe(`flag '${flagKey}' is disabled`);
    expect(evaluation.value).toBe(false);
    expect(evaluation.variant).toBeUndefined();
  });

  it('should validate variant type', () => {
    const evaluation = core.resolveStringEvaluation('myStringFlag', 'hello', {});
    expect(evaluation.value).toBe('hello');
    expect(evaluation.reason).toBe(StandardResolutionReasons.ERROR);
    expect(evaluation.errorCode).toBe(ErrorCode.TYPE_MISMATCH);
  });

  it('should only resolve enabled flags', () => {
    const resolved = core.resolveAll({});
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toHaveProperty('flagKey', 'myStringFlag');
  });
});

describe('flagd-core (restricted environment) common flag definitions', () => {
  it('should support empty targeting rules', () => {
    const core = new FlagdCore();
    const flagCfg = `{"flags":{"isEnabled":{"state":"ENABLED","variants":{"true":true,"false":false},"defaultVariant":"false","targeting":{}}}}`;
    core.setConfigurations(flagCfg);

    const resolved = core.resolveBooleanEvaluation('isEnabled', false, {});
    expect(resolved.value).toBe(false);
    expect(resolved.reason).toBe(StandardResolutionReasons.STATIC);
    expect(resolved.variant).toBe('false');
  });

  it('should throw ParseError with invalid flag state', () => {
    const core = new FlagdCore();
    const flagCfg = `{"flags":{"isEnabled":{"state":"INVALID","variants":{"true":true,"false":false},"defaultVariant":"false"}}}`;
    expect(() => core.setConfigurations(flagCfg)).toThrow(ParseError);
  });

  it('should throw ParseError with invalid flag variants', () => {
    const core = new FlagdCore();
    const flagCfg = `{"flags":{"isEnabled":{"state":"ENABLED","variants":"invalid","defaultVariant":"false"}}}`;
    expect(() => core.setConfigurations(flagCfg)).toThrow(ParseError);
  });

  it('should throw ParseError with invalid flag defaultVariant', () => {
    const core = new FlagdCore();
    const flagCfg = `{"flags":{"isEnabled":{"state":"ENABLED","variants":{"true":true,"false":false},"defaultVariant":{}}}}`;
    expect(() => core.setConfigurations(flagCfg)).toThrow(ParseError);
  });
});

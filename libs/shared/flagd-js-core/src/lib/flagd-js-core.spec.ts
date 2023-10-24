import {FlagdJSCore} from './flagd-js-core';
import {ErrorCode, StandardResolutionReasons} from "@openfeature/server-sdk";

const flagCfg = `{"flags":{"myBoolFlag":{"state":"ENABLED","variants":{"on":true,"off":false},"defaultVariant":"on"},"myStringFlag":{"state":"ENABLED","variants":{"key1":"val1","key2":"val2"},"defaultVariant":"key1"},"myFloatFlag":{"state":"ENABLED","variants":{"one":1.23,"two":2.34},"defaultVariant":"one"},"myIntFlag":{"state":"ENABLED","variants":{"one":1,"two":2},"defaultVariant":"one"},"myObjectFlag":{"state":"ENABLED","variants":{"object1":{"key":"val"},"object2":{"key":true}},"defaultVariant":"object1"},"fibAlgo":{"variants":{"recursive":"recursive","memo":"memo","loop":"loop","binet":"binet"},"defaultVariant":"recursive","state":"ENABLED","targeting":{"if":[{"$ref":"emailWithFaas"},"binet",null]}},"targetedFlag":{"variants":{"first":"AAA","second":"BBB","third":"CCC"},"defaultVariant":"first","state":"ENABLED","targeting":{"if":[{"in":["@openfeature.dev",{"var":"email"}]},"second",{"in":["Chrome",{"var":"userAgent"}]},"third",null]}}},"$evaluators":{"emailWithFaas":{"in":["@faas.com",{"var":["email"]}]}}}`


describe('flagdJsCore resolving', () => {
  let core: FlagdJSCore

  beforeAll(() => {
    core = new FlagdJSCore()
    core.setConfigurations(flagCfg)
  })

  it('should resolve boolean flag', () => {
    const resolved = core.resolveBooleanEvaluation("myBoolFlag", false, {})
    expect(resolved.value).toBeTruthy()
    expect(resolved.reason).toBe(StandardResolutionReasons.STATIC)
  });

  it('should resolve string flag', () => {
    const resolved = core.resolveStringEvaluation("myStringFlag", "key2", {})
    expect(resolved.value).toBe("val1")
    expect(resolved.reason).toBe(StandardResolutionReasons.STATIC)
  });

  it('should resolve number flag', () => {
    const resolved = core.resolveNumberEvaluation("myFloatFlag", 2.34, {})
    expect(resolved.value).toBe(1.23)
    expect(resolved.reason).toBe(StandardResolutionReasons.STATIC)
  });

  it('should resolve object flag', () => {
    const resolved = core.resolveObjectEvaluation("myObjectFlag", {"key": true}, {})
    expect(resolved.value).toStrictEqual({"key": "val"})
    expect(resolved.reason).toBe(StandardResolutionReasons.STATIC)
  });

  it('should validate flag type - eval boolean as string', () => {
    const resolved = core.resolveStringEvaluation("myBoolFlag", 'true', {})
    expect(resolved.value).toBe('true')
    expect(resolved.reason).toBe(StandardResolutionReasons.ERROR)
    expect(resolved.errorCode).toBe(ErrorCode.TYPE_MISMATCH)
  });
});


describe('flagdJsCore validations', () => {
  // flags of disabled, invalid variants and missing variant
  const mixFlags = '{"flags":{"myBoolFlag":{"state":"DISABLED","variants":{"on":true,"off":false},"defaultVariant":"on"},"myStringFlag":{"state":"ENABLED","variants":{"on":true,"off":false},"defaultVariant":"on"},"myIntFlag":{"state":"ENABLED","variants":{"two":2},"defaultVariant":"one"}}}'
  let core: FlagdJSCore

  beforeAll(() => {
    core = new FlagdJSCore()
    core.setConfigurations(mixFlags)
  })

  it('should validate flag status', () => {
    const resolved = core.resolveStringEvaluation("myBoolFlag", 'false', {})
    expect(resolved.value).toBe('false')
    expect(resolved.reason).toBe(StandardResolutionReasons.DISABLED)
    expect(resolved.errorCode).toBe(ErrorCode.GENERAL)
  });

  it('should validate variant', () => {
    const resolved = core.resolveStringEvaluation("myStringFlag", 'hello', {})
    expect(resolved.value).toBe('hello')
    expect(resolved.reason).toBe(StandardResolutionReasons.ERROR)
    expect(resolved.errorCode).toBe(ErrorCode.TYPE_MISMATCH)
  });

  it('should validate variant existence', () => {
    const resolved = core.resolveNumberEvaluation("myIntFlag", 100, {})
    expect(resolved.value).toBe(100)
    expect(resolved.reason).toBe(StandardResolutionReasons.ERROR)
    expect(resolved.errorCode).toBe(ErrorCode.GENERAL)
  });
})

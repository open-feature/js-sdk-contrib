import { type Logger, ParseError } from '@openfeature/core';
import { parse } from './parser';
const logger: Logger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

describe('Flag configurations', () => {
  describe('throwIfSchemaInvalid=false', () => {
    it('should parse valid configurations - single', () => {
      const simpleFlag =
        '{\n' +
        '  "flags": {\n' +
        '    "myBoolFlag": {\n' +
        '      "state": "ENABLED",\n' +
        '      "variants": {\n' +
        '        "on": true,\n' +
        '        "off": false\n' +
        '      },\n' +
        '      "defaultVariant": "on"\n' +
        '    }\n' +
        '  }\n' +
        '}';

      const { flags } = parse(simpleFlag, false, logger);
      expect(flags).toBeTruthy();
      expect(flags.get('myBoolFlag')).toBeTruthy();
    });

    it('should parse valid configurations - long', () => {
      const longFlag =
        '{"flags":{"myBoolFlag":{"state":"ENABLED","variants":{"on":true,"off":false},"defaultVariant":"on"},"myStringFlag":{"state":"ENABLED","variants":{"key1":"val1","key2":"val2"},"defaultVariant":"key1"},"myFloatFlag":{"state":"ENABLED","variants":{"one":1.23,"two":2.34},"defaultVariant":"one"},"myIntFlag":{"state":"ENABLED","variants":{"one":1,"two":2},"defaultVariant":"one"},"myObjectFlag":{"state":"ENABLED","variants":{"object1":{"key":"val"},"object2":{"key":true}},"defaultVariant":"object1"},"fibAlgo":{"variants":{"recursive":"recursive","memo":"memo","loop":"loop","binet":"binet"},"defaultVariant":"recursive","state":"ENABLED","targeting":{"if":[{"$ref":"emailWithFaas"},"binet",null]}},"targetedFlag":{"variants":{"first":"AAA","second":"BBB","third":"CCC"},"defaultVariant":"first","state":"ENABLED","targeting":{"if":[{"in":["@openfeature.dev",{"var":"email"}]},"second",{"in":["Chrome",{"var":"userAgent"}]},"third",null]}}},"$evaluators":{"emailWithFaas":{"in":["@faas.com",{"var":["email"]}]}}}';

      const { flags } = parse(longFlag, false, logger);
      expect(flags).toBeTruthy();
      expect(flags.get('myBoolFlag')).toBeTruthy();
      expect(flags.get('myStringFlag')).toBeTruthy();
    });

    it('should fail if invalid - missing default value', () => {
      const invalidFlag =
        '{\n' +
        '  "flags": {\n' +
        '    "myBoolFlag": {\n' +
        '      "state": "ENABLED",\n' +
        '      "variants": {\n' +
        '        "on": true,\n' +
        '        "off": false\n' +
        '      }\n' +
        '    }\n' +
        '  }\n' +
        '}';

      expect(() => parse(invalidFlag, false, logger)).toThrow();
    });

    it('should parse flag configurations with references', () => {
      const flagWithRef =
        '{"flags":{"fibAlgo":{"variants":{"recursive":"recursive","binet":"binet"},"defaultVariant":"recursive","state":"ENABLED","targeting":{"if":[{"$ref":"emailSuffixFaas"},"binet",null]}}},"$evaluators":{"emailSuffixFaas":{"in":["@faas.com",{"var":["email"]}]}}}';

      const { flags } = parse(flagWithRef, false, logger);
      expect(flags).toBeTruthy();

      const fibAlgo = flags.get('fibAlgo');
      expect(fibAlgo).toBeTruthy();
      expect(fibAlgo?.evaluate({ email: 'test@test.com' })).toHaveProperty('value', 'recursive');
      expect(fibAlgo?.evaluate({ email: 'test@faas.com' })).toHaveProperty('value', 'binet');
    });

    it('should throw a parsing error due to invalid JSON', () => {
      const invalidJson = '{';

      expect(() => parse(invalidJson, false, logger)).toThrow(ParseError);
    });

    it('should throw a parsing error due to invalid flagd configuration', () => {
      const invalidFlagdConfig = '{"flags":{"fibAlgo":{}}}';

      expect(() => parse(invalidFlagdConfig, false, logger)).toThrow(ParseError);
    });

    it('should not throw if targeting invalid', () => {
      const invalidFlag =
        '{\n' +
        '  "flags": {\n' +
        '    "myBoolFlag": {\n' +
        '      "state": "ENABLED",\n' +
        '      "variants": {\n' +
        '        "on": true,\n' +
        '        "off": false\n' +
        '      },\n' +
        '      "defaultVariant": "on",\n' +
        '      "targeting": "invalid"\n' +
        '    }\n' +
        '  }\n' +
        '}';

      expect(() => parse(invalidFlag, false, logger)).not.toThrow(ParseError);
    });
  });

  describe('throwIfSchemaInvalid=true', () => {
    it('should not throw if targeting invalid', () => {
      const invalidFlag =
        '{\n' +
        '  "flags": {\n' +
        '    "myBoolFlag": {\n' +
        '      "state": "ENABLED",\n' +
        '      "variants": {\n' +
        '        "on": true,\n' +
        '        "off": false\n' +
        '      },\n' +
        '      "defaultVariant": "on",\n' +
        '      "targeting": "invalid"\n' +
        '    }\n' +
        '  }\n' +
        '}';

      expect(() => parse(invalidFlag, true, logger)).toThrow(ParseError);
    });

    it('should not throw if targeting is valid', () => {
      const invalidFlag =
        '{\n' +
        '  "flags": {\n' +
        '    "myBoolFlag": {\n' +
        '      "state": "ENABLED",\n' +
        '      "variants": {\n' +
        '        "on": true,\n' +
        '        "off": false\n' +
        '      },\n' +
        '      "defaultVariant": "off",\n' +
        '      "targeting": {"if":[{"in":[{"var":"locale"},["us","ca"]]}, "true"]}' +
        '    }\n' +
        '  }\n' +
        '}';

      expect(() => parse(invalidFlag, true, logger)).not.toThrow();
    });
  });
});

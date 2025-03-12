import { ParseError, StandardResolutionReasons } from '@openfeature/core';
import { SSMService } from './ssm-service';

describe(SSMService.name, () => {
  describe(SSMService.prototype.getBooleanValue.name, () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });
    describe(`when _getParamFromSSM returns "true"`, () => {
      it(`should return a ResolutionDetails with value true`, async () => {
        jest.spyOn(SSMService.prototype, '_getValueFromSSM').mockResolvedValue('true');
        const service = new SSMService({});
        const result = await service.getBooleanValue('test');
        expect(result).toEqual({ value: true, reason: StandardResolutionReasons.STATIC });
      });
    });
    describe(`when _getParamFromSSM returns "false"`, () => {
      it(`should return a ResolutionDetails with value true`, async () => {
        jest.spyOn(SSMService.prototype, '_getValueFromSSM').mockResolvedValue('false');
        const service = new SSMService({});
        const result = await service.getBooleanValue('test');
        expect(result).toEqual({ value: false, reason: StandardResolutionReasons.STATIC });
      });
    });
    describe(`when _getParamFromSSM returns an invalid value`, () => {
      it('should throw a ParseError', () => {
        jest.spyOn(SSMService.prototype, '_getValueFromSSM').mockResolvedValue('invalid boolean');
        const service = new SSMService({});
        expect(() => service.getBooleanValue('test')).rejects.toThrow(ParseError);
      });
    });
  });
  describe(SSMService.prototype.getStringValue.name, () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });
    describe(`when _getParamFromSSM returns a valid value`, () => {
      it(`should return a ResolutionDetails with that value`, async () => {
        jest.spyOn(SSMService.prototype, '_getValueFromSSM').mockResolvedValue('example');
        const service = new SSMService({});
        const result = await service.getStringValue('example');
        expect(result).toEqual({ value: 'example', reason: StandardResolutionReasons.STATIC });
      });
    });
  });
  describe(SSMService.prototype.getNumberValue.name, () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });
    describe(`when _getParamFromSSM returns a valid number`, () => {
      it(`should return a ResolutionDetails with value true`, async () => {
        jest.spyOn(SSMService.prototype, '_getValueFromSSM').mockResolvedValue('1478');
        const service = new SSMService({});
        const result = await service.getNumberValue('test');
        expect(result).toEqual({ value: 1478, reason: StandardResolutionReasons.STATIC });
      });
    });
    describe(`when _getParamFromSSM returns a value that is not a number`, () => {
      it(`should return a ParseError`, async () => {
        jest.spyOn(SSMService.prototype, '_getValueFromSSM').mockResolvedValue('invalid number');
        const service = new SSMService({});
        expect(() => service.getNumberValue('test')).rejects.toThrow(ParseError);
      });
    });
  });
  describe(SSMService.prototype.getObjectValue.name, () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });
    describe(`when _getParamFromSSM returns a valid object`, () => {
      it(`should return a ResolutionDetails with that object`, async () => {
        jest.spyOn(SSMService.prototype, '_getValueFromSSM').mockResolvedValue(JSON.stringify({ test: true }));
        const service = new SSMService({});
        const result = await service.getObjectValue('test');
        expect(result).toEqual({ value: { test: true }, reason: StandardResolutionReasons.STATIC });
      });
    });
    describe(`when _getParamFromSSM returns an invalid object`, () => {
      it(`should return a ParseError`, async () => {
        jest.spyOn(SSMService.prototype, '_getValueFromSSM').mockResolvedValue('invalid object');
        const service = new SSMService({});
        expect(() => service.getObjectValue('test')).rejects.toThrow(ParseError);
      });
    });
  });
});

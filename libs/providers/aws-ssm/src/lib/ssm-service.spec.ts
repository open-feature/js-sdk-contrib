import { ParseError, StandardResolutionReasons, TypeMismatchError } from '@openfeature/core';
import { SSMService } from './ssm-service';

describe(SSMService.name, () => {
  describe(SSMService.prototype.getBooleanValue.name, () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });
    describe(`when _getParamFromSSM returns "true"`, () => {
      it(`should return a ResolutionDetails with value true`, async () => {
        jest
          .spyOn(SSMService.prototype, '_getValueFromSSM')
          .mockResolvedValue({ val: 'true', metadata: { httpStatusCode: 200 } });
        const service = new SSMService({});
        const result = await service.getBooleanValue('test');
        expect(result).toEqual({
          value: true,
          reason: StandardResolutionReasons.STATIC,
          flagMetadata: { httpStatusCode: 200 },
        });
      });
    });
    describe(`when _getParamFromSSM returns "false"`, () => {
      it(`should return a ResolutionDetails with value true`, async () => {
        jest
          .spyOn(SSMService.prototype, '_getValueFromSSM')
          .mockResolvedValue({ val: 'false', metadata: { httpStatusCode: 200 } });
        const service = new SSMService({});
        const result = await service.getBooleanValue('test');
        expect(result).toEqual({
          value: false,
          reason: StandardResolutionReasons.STATIC,
          flagMetadata: { httpStatusCode: 200 },
        });
      });
    });
    describe(`when _getParamFromSSM returns an invalid value`, () => {
      it('should throw a TypeMismatchError', () => {
        jest
          .spyOn(SSMService.prototype, '_getValueFromSSM')
          .mockResolvedValue({ val: 'invalid boolean', metadata: { httpStatusCode: 400 } });
        const service = new SSMService({});
        expect(() => service.getBooleanValue('test')).rejects.toThrow(TypeMismatchError);
      });
    });
  });
  describe(SSMService.prototype.getStringValue.name, () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });
    describe(`when _getParamFromSSM returns a valid value`, () => {
      it(`should return a ResolutionDetails with that value`, async () => {
        jest
          .spyOn(SSMService.prototype, '_getValueFromSSM')
          .mockResolvedValue({ val: 'example', metadata: { httpStatusCode: 200 } });
        const service = new SSMService({});
        const result = await service.getStringValue('example');
        expect(result).toEqual({
          value: 'example',
          reason: StandardResolutionReasons.STATIC,
          flagMetadata: { httpStatusCode: 200 },
        });
      });
    });
  });
  describe(SSMService.prototype.getNumberValue.name, () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });
    describe(`when _getParamFromSSM returns a valid number`, () => {
      it(`should return a ResolutionDetails with value true`, async () => {
        jest
          .spyOn(SSMService.prototype, '_getValueFromSSM')
          .mockResolvedValue({ val: '1478', metadata: { httpStatusCode: 200 } });
        const service = new SSMService({});
        const result = await service.getNumberValue('test');
        expect(result).toEqual({
          value: 1478,
          reason: StandardResolutionReasons.STATIC,
          flagMetadata: { httpStatusCode: 200 },
        });
      });
    });
    describe(`when _getParamFromSSM returns a value that is not a number`, () => {
      it(`should return a TypeMismatchError`, async () => {
        jest
          .spyOn(SSMService.prototype, '_getValueFromSSM')
          .mockResolvedValue({ val: 'invalid number', metadata: { httpStatusCode: 400 } });
        const service = new SSMService({});
        expect(() => service.getNumberValue('test')).rejects.toThrow(TypeMismatchError);
      });
    });
  });
  describe(SSMService.prototype.getObjectValue.name, () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });
    describe(`when _getParamFromSSM returns a valid object`, () => {
      it(`should return a ResolutionDetails with that object`, async () => {
        jest
          .spyOn(SSMService.prototype, '_getValueFromSSM')
          .mockResolvedValue({ val: JSON.stringify({ test: true }), metadata: { httpStatusCode: 400 } });
        const service = new SSMService({});
        const result = await service.getObjectValue('test');
        expect(result).toEqual({
          value: { test: true },
          reason: StandardResolutionReasons.STATIC,
          flagMetadata: { httpStatusCode: 400 },
        });
      });
    });
    describe(`when _getParamFromSSM returns an invalid object`, () => {
      it(`should return a ParseError`, async () => {
        jest
          .spyOn(SSMService.prototype, '_getValueFromSSM')
          .mockResolvedValue({ val: 'invalid object', metadata: { httpStatusCode: 400 } });
        const service = new SSMService({});
        expect(() => service.getObjectValue('test')).rejects.toThrow(ParseError);
      });
    });
  });
});

import { ParseError, StandardResolutionReasons, TypeMismatchError } from '@openfeature/core';
import { SSMService } from './ssm-service';

describe('ssm-service.ts - SSMService', () => {
  let service: SSMService;
  let getValueFromSSMSpy: jest.SpyInstance;

  beforeAll(() => {
    service = new SSMService({});
    getValueFromSSMSpy = jest.spyOn(SSMService.prototype, '_getValueFromSSM');
  });

  describe('getBooleanValue', () => {
    it("should return true when _getValueFromSSM returns 'true'", async () => {
      getValueFromSSMSpy.mockResolvedValue({ val: 'true', metadata: { httpStatusCode: 200 } });

      const result = await service.getBooleanValue('test');

      expect(result).toEqual({
        value: true,
        reason: StandardResolutionReasons.STATIC,
        flagMetadata: { httpStatusCode: 200 },
      });
    });

    it("should return false when _getValueFromSSM returns 'false'", async () => {
      getValueFromSSMSpy.mockResolvedValue({ val: 'false', metadata: { httpStatusCode: 200 } });

      const result = await service.getBooleanValue('test');

      expect(result).toEqual({
        value: false,
        reason: StandardResolutionReasons.STATIC,
        flagMetadata: { httpStatusCode: 200 },
      });
    });

    it('should throw TypeMismatchError when _getValueFromSSM returns invalid boolean', async () => {
      getValueFromSSMSpy.mockResolvedValue({ val: 'invalid boolean', metadata: { httpStatusCode: 400 } });

      await expect(service.getBooleanValue('test')).rejects.toThrow(TypeMismatchError);
    });
  });

  describe('getStringValue', () => {
    it('should return the string value when _getValueFromSSM returns valid value', async () => {
      getValueFromSSMSpy.mockResolvedValue({ val: 'example', metadata: { httpStatusCode: 200 } });

      const result = await service.getStringValue('example');

      expect(result).toEqual({
        value: 'example',
        reason: StandardResolutionReasons.STATIC,
        flagMetadata: { httpStatusCode: 200 },
      });
    });
  });

  describe('getNumberValue', () => {
    it('should return the number value when _getValueFromSSM returns valid number', async () => {
      getValueFromSSMSpy.mockResolvedValue({ val: '1478', metadata: { httpStatusCode: 200 } });

      const result = await service.getNumberValue('test');

      expect(result).toEqual({
        value: 1478,
        reason: StandardResolutionReasons.STATIC,
        flagMetadata: { httpStatusCode: 200 },
      });
    });

    it('should throw TypeMismatchError when _getValueFromSSM returns invalid number', async () => {
      getValueFromSSMSpy.mockResolvedValue({ val: 'invalid number', metadata: { httpStatusCode: 400 } });

      await expect(service.getNumberValue('test')).rejects.toThrow(TypeMismatchError);
    });
  });

  describe('getObjectValue', () => {
    it('should return the parsed object when _getValueFromSSM returns valid JSON', async () => {
      getValueFromSSMSpy.mockResolvedValue({ val: JSON.stringify({ test: true }), metadata: { httpStatusCode: 400 } });

      const result = await service.getObjectValue('test');

      expect(result).toEqual({
        value: { test: true },
        reason: StandardResolutionReasons.STATIC,
        flagMetadata: { httpStatusCode: 400 },
      });
    });

    it('should throw ParseError when _getValueFromSSM returns invalid JSON', async () => {
      getValueFromSSMSpy.mockResolvedValue({ val: 'invalid object', metadata: { httpStatusCode: 400 } });

      await expect(service.getObjectValue('test')).rejects.toThrow(ParseError);
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });
});

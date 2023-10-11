import { FlagNotFoundError, ParseError } from '@openfeature/server-sdk';
import { EnvVarProvider } from './env-var-provider';

describe('Environment Variable Provider', () => {
  const envVarProvider = new EnvVarProvider();
  const ORIGINAL_ENV = process.env;

  const methods = [
    'resolveBooleanEvaluation',
    'resolveNumberEvaluation',
    'resolveStringEvaluation',
    'resolveObjectEvaluation',
  ] as const;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('should match the expected metadata name', async () => {
    expect(envVarProvider.metadata.name).toBe('environment variable');
  });

  describe('flag not found', () => {
    methods.forEach(async (i) => {
      it(`should not find a flag when calling ${i}`, async () => {
        await expect(envVarProvider[i]('not_found')).rejects.toThrow(FlagNotFoundError);
      });
    });
  });

  describe('flag not found due to case mismatch', () => {
    const envVarProviderConstCaseDisabled = new EnvVarProvider({ disableConstantCase: true });

    methods.forEach(async (i) => {
      it(`should not find a flag when calling ${i}`, async () => {
        process.env['NOT_FOUND'] = 'true';
        await expect(envVarProviderConstCaseDisabled[i]('not_found')).rejects.toThrow(FlagNotFoundError);
      });
    });
  });

  describe('resolveBooleanEvaluation', () => {
    it('should return true', async () => {
      process.env['BOOL_VALUE'] = 'true';
      await expect(envVarProvider.resolveBooleanEvaluation('bool-value')).resolves.toMatchObject({
        reason: 'STATIC',
        value: true,
      });
    });

    it('should return false', async () => {
      process.env['BOOL_VALUE'] = 'false';
      await expect(envVarProvider.resolveBooleanEvaluation('bool-value')).resolves.toMatchObject({
        reason: 'STATIC',
        value: false,
      });
    });

    it('should return the default value because the value was the wrong type', async () => {
      process.env['BOOL_VALUE'] = 'invalid';
      await expect(envVarProvider.resolveBooleanEvaluation('bool-value')).rejects.toThrow(ParseError);
    });
  });

  describe('resolveNumberEvaluation', () => {
    it('should return 1', async () => {
      process.env['NUM_VALUE'] = '1';
      await expect(envVarProvider.resolveNumberEvaluation('num-value')).resolves.toMatchObject({
        reason: 'STATIC',
        value: 1,
      });
    });

    it('should return 1.25', async () => {
      process.env['NUM_VALUE'] = '1.25';
      await expect(envVarProvider.resolveNumberEvaluation('num-value')).resolves.toMatchObject({
        reason: 'STATIC',
        value: 1.25,
      });
    });

    it('should return the default value because the value was the wrong type', async () => {
      process.env['NUM_VALUE'] = 'invalid';
      await expect(envVarProvider.resolveBooleanEvaluation('num-value')).rejects.toThrow(ParseError);
    });
  });

  describe('resolveStringEvaluation', () => {
    it('should return openfeature', async () => {
      process.env['STR_VALUE'] = 'openfeature';
      await expect(envVarProvider.resolveStringEvaluation('str-value')).resolves.toMatchObject({
        reason: 'STATIC',
        value: 'openfeature',
      });
    });
  });

  describe('resolveObjectEvaluation', () => {
    it('should return true', async () => {
      process.env['OBJ_VALUE'] = 'true';
      await expect(envVarProvider.resolveObjectEvaluation('obj-value')).resolves.toMatchObject({
        reason: 'STATIC',
        value: true,
      });
    });

    it('should return 1', async () => {
      process.env['OBJ_VALUE'] = 'true';
      await expect(envVarProvider.resolveObjectEvaluation('obj-value')).resolves.toMatchObject({
        reason: 'STATIC',
        value: true,
      });
    });

    it('should return openfeature', async () => {
      process.env['OBJ_VALUE'] = 'true';
      await expect(envVarProvider.resolveObjectEvaluation('obj-value')).resolves.toMatchObject({
        reason: 'STATIC',
        value: true,
      });
    });

    it('should return an object with the name openfeature', async () => {
      process.env['OBJ_VALUE'] = '{"name": "openfeature"}';
      await expect(envVarProvider.resolveObjectEvaluation('obj-value')).resolves.toMatchObject({
        reason: 'STATIC',
        value: { name: 'openfeature' },
      });
    });

    it('should return an array containing the string openfeature', async () => {
      process.env['OBJ_VALUE'] = '["openfeature"]';
      await expect(envVarProvider.resolveObjectEvaluation('obj-value')).resolves.toMatchObject({
        reason: 'STATIC',
        value: ['openfeature'],
      });
    });
  });
});

import {
  Provider,
  ResolutionDetails,
  ErrorCode,
  OpenFeature,
} from '@openfeature/nodejs-sdk';
import { FederatedProvider } from './federated-provider';

describe('FederatedProvider', () => {
  describe('All Providers Error', () => {
    const provider = new FederatedProvider([
      {
        resolveBooleanEvaluation: () => {
          return {
            errorCode: ErrorCode.FLAG_NOT_FOUND,
          };
        },
        resolveStringEvaluation: () => {
          return {
            errorCode: ErrorCode.FLAG_NOT_FOUND,
          };
        },
        resolveNumberEvaluation: () => {
          return {
            errorCode: ErrorCode.FLAG_NOT_FOUND,
          };
        },
        resolveObjectEvaluation: () => {
          return {
            errorCode: ErrorCode.FLAG_NOT_FOUND,
          };
        },
      } as unknown as Provider,
    ]);

    it('should throw because the flag can not be found during boolean evaluation', async () => {
      await expect(
        provider.resolveBooleanEvaluation('test', false, {})
      ).rejects.toThrowError();
    });

    it('should throw because the flag can not be found during string evaluation', async () => {
      await expect(
        provider.resolveStringEvaluation('test', 'test', {})
      ).rejects.toThrowError();
    });

    it('should throw because the flag can not be found during number evaluation', async () => {
      await expect(
        provider.resolveNumberEvaluation('test', 1, {})
      ).rejects.toThrowError();
    });

    it('should throw because the flag can not be found during object evaluation', async () => {
      await expect(
        provider.resolveObjectEvaluation('test', { name: 'test' }, {})
      ).rejects.toThrowError();
    });
  });

  describe('Use value from first successful provider', () => {
    const mockProvider1Boolean = jest.fn(
      (): Promise<ResolutionDetails<boolean>> => {
        return Promise.resolve({
          value: false,
          errorCode: ErrorCode.FLAG_NOT_FOUND,
        });
      }
    );
    const mockProvider1String = jest.fn(
      (): Promise<ResolutionDetails<string>> => {
        return Promise.resolve({
          value: 'error',
          errorCode: ErrorCode.FLAG_NOT_FOUND,
        });
      }
    );
    const mockProvider1Number = jest.fn(
      (): Promise<ResolutionDetails<number>> => {
        return Promise.resolve({
          value: 0,
          errorCode: ErrorCode.FLAG_NOT_FOUND,
        });
      }
    );
    const mockProvider1Object = jest.fn(
      (): Promise<ResolutionDetails<object>> => {
        return Promise.resolve({
          value: { name: 'error' },
          errorCode: ErrorCode.FLAG_NOT_FOUND,
        });
      }
    );

    const provider1 = {
      resolveBooleanEvaluation: mockProvider1Boolean,
      resolveStringEvaluation: mockProvider1String,
      resolveNumberEvaluation: mockProvider1Number,
      resolveObjectEvaluation: mockProvider1Object,
    } as unknown as Provider;

    const mockProvider2Boolean = jest.fn(
      (): Promise<ResolutionDetails<boolean>> => {
        return Promise.resolve({
          value: true,
        });
      }
    );
    const mockProvider2String = jest.fn(
      (): Promise<ResolutionDetails<string>> => {
        return Promise.resolve({
          value: 'openfeature',
        });
      }
    );
    const mockProvider2Number = jest.fn(
      (): Promise<ResolutionDetails<number>> => {
        return Promise.resolve({
          value: 10,
        });
      }
    );
    const mockProvider2Object = jest.fn(
      (): Promise<ResolutionDetails<object>> => {
        return Promise.resolve({
          value: { name: 'openfeature' },
        });
      }
    );
    const provider2 = {
      resolveBooleanEvaluation: mockProvider2Boolean,
      resolveStringEvaluation: mockProvider2String,
      resolveNumberEvaluation: mockProvider2Number,
      resolveObjectEvaluation: mockProvider2Object,
    } as unknown as Provider;

    const mockProvider3Boolean = jest.fn(
      (): Promise<ResolutionDetails<boolean>> => {
        return Promise.resolve({
          value: true,
        });
      }
    );
    const mockProvider3String = jest.fn(
      (): Promise<ResolutionDetails<string>> => {
        return Promise.resolve({
          value: 'openfeature',
        });
      }
    );
    const mockProvider3Number = jest.fn(
      (): Promise<ResolutionDetails<number>> => {
        return Promise.resolve({
          value: 11,
        });
      }
    );
    const mockProvider3Object = jest.fn(
      (): Promise<ResolutionDetails<object>> => {
        return Promise.resolve({
          value: { name: 'openfeature' },
        });
      }
    );
    const provider3 = {
      resolveBooleanEvaluation: mockProvider3Boolean,
      resolveStringEvaluation: mockProvider3String,
      resolveNumberEvaluation: mockProvider3Number,
      resolveObjectEvaluation: mockProvider3Object,
    } as unknown as Provider;

    const federatedProvider = new FederatedProvider([
      provider1,
      provider2,
      provider3,
    ]);

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should resolve a boolean value from the second provider', async () => {
      await expect(
        federatedProvider.resolveBooleanEvaluation('test', false, {})
      ).resolves.toStrictEqual({ value: true });

      expect(mockProvider1Boolean).toHaveBeenCalledTimes(1);
      expect(mockProvider2Boolean).toHaveBeenCalledTimes(1);
      expect(mockProvider3Boolean).not.toHaveBeenCalled();
    });

    it('should resolve a string value from the second provider', async () => {
      await expect(
        federatedProvider.resolveStringEvaluation('test', 'fallback', {})
      ).resolves.toStrictEqual({ value: 'openfeature' });

      expect(mockProvider1String).toHaveBeenCalledTimes(1);
      expect(mockProvider2String).toHaveBeenCalledTimes(1);
      expect(mockProvider3String).not.toHaveBeenCalled();
    });

    it('should resolve a number value from the second provider', async () => {
      await expect(
        federatedProvider.resolveNumberEvaluation('test', 2, {})
      ).resolves.toStrictEqual({ value: 10 });

      expect(mockProvider1Number).toHaveBeenCalledTimes(1);
      expect(mockProvider2Number).toHaveBeenCalledTimes(1);
      expect(mockProvider3Number).not.toHaveBeenCalled();
    });

    it('should resolve a object value from the second provider', async () => {
      await expect(
        federatedProvider.resolveObjectEvaluation(
          'test',
          { name: 'federated' },
          {}
        )
      ).resolves.toStrictEqual({ value: { name: 'openfeature' } });

      expect(mockProvider1Object).toHaveBeenCalledTimes(1);
      expect(mockProvider2Object).toHaveBeenCalledTimes(1);
      expect(mockProvider3Object).not.toHaveBeenCalled();
    });
  });

  describe('Provider Hooks', () => {
    const mockHook = jest.fn();
    OpenFeature.setProvider(
      new FederatedProvider([
        {
          hooks: [
            {
              before: mockHook,
            },
          ],
          resolveBooleanEvaluation: () => {
            return {
              value: true,
            };
          },
          resolveStringEvaluation: () => {
            return {
              value: 'enabled',
            };
          },
          resolveNumberEvaluation: () => {
            return {
              value: 10,
            };
          },
          resolveObjectEvaluation: () => {
            return {
              value: { name: 'openfeature' },
            };
          },
        } as unknown as Provider,
      ])
    );
    const client = OpenFeature.getClient();

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('provider hook should run when getting boolean value', async () => {
      await expect(
        client.getBooleanValue('test', false)
      ).resolves.toStrictEqual(true);
      expect(mockHook).toBeCalledTimes(1);
    });

    it('provider hook should run when getting string value', async () => {
      await expect(
        client.getStringValue('test', 'test')
      ).resolves.toStrictEqual('enabled');
      expect(mockHook).toBeCalledTimes(1);
    });

    it('provider hook should run when getting number value', async () => {
      await expect(client.getNumberValue('test', 1)).resolves.toStrictEqual(10);
      expect(mockHook).toBeCalledTimes(1);
    });

    it('provider hook should run when getting object value', async () => {
      await expect(
        client.getObjectValue('test', { name: 'test' })
      ).resolves.toStrictEqual({ name: 'openfeature' });
      expect(mockHook).toBeCalledTimes(1);
    });
  });
});

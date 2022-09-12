import {
  Client, OpenFeature, ErrorCode
} from '@openfeature/nodejs-sdk';
import type { UnaryCall } from "@protobuf-ts/runtime-rpc";
import { Struct } from '../proto/ts/google/protobuf/struct';
import { ServiceClient } from '../proto/ts/schema/v1/schema.client';
import { ResolveBooleanRequest,
  ResolveBooleanResponse,
  ResolveFloatRequest,
  ResolveFloatResponse,
  ResolveIntRequest,
  ResolveIntResponse,
  ResolveObjectRequest,
  ResolveObjectResponse,
  ResolveStringRequest,
  ResolveStringResponse } from '../proto/ts/schema/v1/schema';
import { FlagdProvider } from './flagd-provider';
import { GRPCService } from './service/grpc/service';

const REASON = 'STATIC';
const ERROR_REASON = 'ERROR';

const BOOLEAN_KEY = 'bool-flag';
const BOOLEAN_VARIANT = 'on';
const BOOLEAN_VALUE = true;

const STRING_KEY = 'string-key';
const STRING_VARIANT = 'hello';
const STRING_VALUE = 'Hello!';

const NUMBER_KEY = 'float-key';
const NUMBER_VARIANT = '2^11';
const NUMBER_VALUE = 2048;

const OBJECT_KEY = 'object-flag';
const OBJECT_VARIANT = 'obj';
const OBJECT_INNER_KEY = 'inner-key';
const OBJECT_INNER_VALUE = 'inner-val';
const OBJECT_VALUE = Struct.fromJson({[OBJECT_INNER_KEY]: OBJECT_INNER_VALUE});

const TEST_CONTEXT_KEY = 'context-key';
const TEST_CONTEXT_VALUE = 'context-value';
const TEST_CONTEXT = { [TEST_CONTEXT_KEY]: TEST_CONTEXT_VALUE };
const TEST_CONTEXT_CONVERTED = Struct.fromJsonString(JSON.stringify(TEST_CONTEXT));

describe(FlagdProvider.name, () => {

  describe('basic flag resolution', () => {
    let client: Client;

    // mock ServiceClient to inject
    const basicServiceClientMock: ServiceClient = {
      resolveBoolean: jest.fn((): UnaryCall<ResolveBooleanRequest, ResolveBooleanResponse> => {
        return Promise.resolve({
          request: {} as ResolveBooleanRequest,
          response: {
            value: BOOLEAN_VALUE,
            variant: BOOLEAN_VARIANT,
            reason: REASON
          },
        }) as unknown as UnaryCall<ResolveBooleanRequest, ResolveBooleanResponse>
      }),
      resolveString: jest.fn((): UnaryCall<ResolveStringRequest, ResolveStringResponse> => {
        return Promise.resolve({
          request: {} as ResolveStringRequest,
          response: {
            value: STRING_VALUE,
            variant: STRING_VARIANT,
            reason: REASON
          } as ResolveStringResponse,
        }) as unknown as UnaryCall<ResolveStringRequest, ResolveStringResponse>
      }),
      resolveFloat: jest.fn((): UnaryCall<ResolveFloatRequest, ResolveFloatResponse> => {
        return Promise.resolve({
          request: {} as ResolveFloatRequest,
          response: {
            value: NUMBER_VALUE,
            variant: NUMBER_VARIANT,
            reason: REASON
          } as ResolveFloatResponse,
        }) as unknown as UnaryCall<ResolveFloatRequest, ResolveFloatResponse>
      }),
      resolveInt: jest.fn((): UnaryCall<ResolveIntRequest, ResolveIntResponse> => {
        throw new Error('resolveInt should not be called'); // we never call this method, we resolveFloat for all numbers.
      }),
      resolveObject: jest.fn((): UnaryCall<ResolveObjectRequest, ResolveObjectResponse> => {
        return Promise.resolve({
          request: {} as ResolveObjectRequest,
          response: {
            value: OBJECT_VALUE,
            variant: OBJECT_VARIANT,
            reason: REASON
          } as ResolveObjectResponse,
        }) as unknown as UnaryCall<ResolveObjectRequest, ResolveObjectResponse>
      })
    } as unknown as ServiceClient;
  
    beforeEach(() => {
       // inject our mock GRPCService and ServiceClient
      OpenFeature.setProvider(new FlagdProvider(undefined, new GRPCService({ host: '', port: 123, protocol: 'http' }, basicServiceClientMock)));
      client = OpenFeature.getClient('test');
    });
  
    describe(FlagdProvider.prototype.resolveBooleanEvaluation.name, () => {
      it(`should call ${ServiceClient.prototype.resolveBoolean} with key and context and return details`, async () => {
        const val = await client.getBooleanDetails(BOOLEAN_KEY, false, TEST_CONTEXT);
        expect(basicServiceClientMock.resolveBoolean).toHaveBeenCalledWith({flagKey: BOOLEAN_KEY, context: TEST_CONTEXT_CONVERTED});
        expect(val.value).toEqual(BOOLEAN_VALUE);
        expect(val.variant).toEqual(BOOLEAN_VARIANT);
        expect(val.reason).toEqual(REASON);
      });
    });
  
    describe(FlagdProvider.prototype.resolveStringEvaluation.name, () => {
      it(`should call ${ServiceClient.prototype.resolveString} with key and context and return details`, async () => {
        const val = await client.getStringDetails(STRING_KEY, 'nope', TEST_CONTEXT);
        expect(basicServiceClientMock.resolveString).toHaveBeenCalledWith({flagKey: STRING_KEY, context: TEST_CONTEXT_CONVERTED});
        expect(val.value).toEqual(STRING_VALUE);
        expect(val.variant).toEqual(STRING_VARIANT);
        expect(val.reason).toEqual(REASON);
      });
    });
  
    describe(FlagdProvider.prototype.resolveNumberEvaluation.name, () => {
      it(`should call ${ServiceClient.prototype.resolveFloat} with key and context and return details`, async () => {
        const val = await client.getNumberDetails(NUMBER_KEY, 0, TEST_CONTEXT);
        expect(basicServiceClientMock.resolveFloat).toHaveBeenCalledWith({flagKey: NUMBER_KEY, context: TEST_CONTEXT_CONVERTED});
        expect(val.value).toEqual(NUMBER_VALUE);
        expect(val.variant).toEqual(NUMBER_VARIANT);
        expect(val.reason).toEqual(REASON);
      });
    });
  
    describe(FlagdProvider.prototype.resolveObjectEvaluation.name, () => {
      it(`should call ${ServiceClient.prototype.resolveObject} with key and context and return details`, async () => {
        const val = await client.getObjectDetails(OBJECT_KEY, {}, TEST_CONTEXT);
        expect(basicServiceClientMock.resolveObject).toHaveBeenCalledWith({flagKey: OBJECT_KEY, context: TEST_CONTEXT_CONVERTED});
        expect(val.value).toEqual({ [OBJECT_INNER_KEY]: OBJECT_INNER_VALUE });
        expect(val.variant).toEqual(OBJECT_VARIANT);
        expect(val.reason).toEqual(REASON);
      });
    });
  });

  describe('resolution errors', () => {
    const errorResponsePartial = {
      reason: ERROR_REASON,
    }

    let client: Client;

    // mock ServiceClient to inject
    const errServiceClientMock: ServiceClient = {
      resolveBoolean: jest.fn((): UnaryCall<ResolveBooleanRequest, ResolveBooleanResponse> => {
        return Promise.reject({
          request: {} as ResolveBooleanRequest,
          response: errorResponsePartial,
        }) as unknown as UnaryCall<ResolveBooleanRequest, ResolveBooleanResponse>
      }),
      resolveString: jest.fn((): UnaryCall<ResolveStringRequest, ResolveStringResponse> => {
        return Promise.reject({
          request: {} as ResolveStringRequest,
          response: errorResponsePartial as ResolveStringResponse,
        }) as unknown as UnaryCall<ResolveStringRequest, ResolveStringResponse>
      }),
      resolveFloat: jest.fn((): UnaryCall<ResolveFloatRequest, ResolveFloatResponse> => {
        return Promise.reject({
          request: {} as ResolveFloatRequest,
          response: errorResponsePartial as ResolveFloatResponse,
        }) as unknown as UnaryCall<ResolveFloatRequest, ResolveFloatResponse>
      }),
      resolveInt: jest.fn((): UnaryCall<ResolveIntRequest, ResolveIntResponse> => {
        throw new Error('resolveInt should not be called'); // we never call this method, we resolveFloat for all numbers.
      }),
      resolveObject: jest.fn((): UnaryCall<ResolveObjectRequest, ResolveObjectResponse> => {
        return Promise.reject({
          request: {} as ResolveObjectRequest,
          response: errorResponsePartial as ResolveObjectResponse,
        }) as unknown as UnaryCall<ResolveObjectRequest, ResolveObjectResponse>
      })
    } as unknown as ServiceClient;
  
    beforeEach(() => {
      // inject our mock GRPCService and ServiceClient
      OpenFeature.setProvider(new FlagdProvider(undefined, new GRPCService({ host: '', port: 123, protocol: 'http' }, errServiceClientMock)));
      client = OpenFeature.getClient('test');
    });
  
    describe(FlagdProvider.prototype.resolveBooleanEvaluation.name, () => {
      const DEFAULT = false;

      it('should default', async () => {
        const val = await client.getBooleanDetails(BOOLEAN_KEY, DEFAULT);
        expect(errServiceClientMock.resolveBoolean).toHaveBeenCalled();
        expect(val.value).toEqual(DEFAULT);
        expect(val.reason).toEqual(ERROR_REASON);
      });
    });
  
    describe(FlagdProvider.prototype.resolveStringEvaluation.name, () => {
      const DEFAULT = 'nope';

      it('should default', async () => {
        const val = await client.getStringDetails(STRING_KEY, DEFAULT);
        expect(errServiceClientMock.resolveString).toHaveBeenCalled();
        expect(val.value).toEqual(DEFAULT);
        expect(val.reason).toEqual(ERROR_REASON);
      });
    });
  
    describe(FlagdProvider.prototype.resolveNumberEvaluation.name, () => {
      const DEFAULT = 0

      it('should default', async () => {
        const val = await client.getNumberDetails(NUMBER_KEY, DEFAULT);
        expect(errServiceClientMock.resolveFloat).toHaveBeenCalled();
        expect(val.value).toEqual(DEFAULT);
        expect(val.reason).toEqual(ERROR_REASON);
      });
    });
  
    describe(FlagdProvider.prototype.resolveObjectEvaluation.name, () => {

      const DEFAULT_INNER_KEY = 'uh';
      const DEFAULT_INNER_VALUE = 'oh';

      it('should default', async () => {
        const val = await client.getObjectDetails(OBJECT_KEY, { [DEFAULT_INNER_KEY]: DEFAULT_INNER_VALUE });
        expect(errServiceClientMock.resolveObject).toHaveBeenCalled();
        expect(val.value).toEqual({ [DEFAULT_INNER_KEY]: DEFAULT_INNER_VALUE });
        expect(val.reason).toEqual(ERROR_REASON);
      });
    });
  });

  describe('undefined object value', () => {
    let client: Client;

    // mock ServiceClient to inject
    const undefinedObjectMock: ServiceClient = {
      resolveObject: jest.fn((): UnaryCall<ResolveObjectRequest, ResolveObjectResponse> => {
        return Promise.resolve({
          request: {} as ResolveObjectRequest,
          response: {
            value: undefined,
            reason: REASON
          } as ResolveObjectResponse,
        }) as unknown as UnaryCall<ResolveObjectRequest, ResolveObjectResponse>
      })
    } as unknown as ServiceClient;
  
    beforeEach(() => {
      // inject our mock GRPCService and ServiceClient
      OpenFeature.setProvider(new FlagdProvider(undefined, new GRPCService({ host: '', port: 123, protocol: 'http' }, undefinedObjectMock)));
      client = OpenFeature.getClient('test');
    });
  
    describe(FlagdProvider.prototype.resolveObjectEvaluation.name, () => {

      const DEFAULT_INNER_KEY = 'some';
      const DEFAULT_INNER_VALUE = 'key';

      it('should default and throw correct error', async () => {
        const val = await client.getObjectDetails(OBJECT_KEY, { [DEFAULT_INNER_KEY]: DEFAULT_INNER_VALUE });
        expect(undefinedObjectMock.resolveObject).toHaveBeenCalled();
        expect(val.value).toEqual({ [DEFAULT_INNER_KEY]: DEFAULT_INNER_VALUE });
        expect(val.reason).toEqual(ERROR_REASON);
        expect(val.errorCode).toEqual(ErrorCode.PARSE_ERROR);
      });
    });
  });
});

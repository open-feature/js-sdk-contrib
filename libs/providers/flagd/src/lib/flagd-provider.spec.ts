jest.mock('@protobuf-ts/grpc-transport');

import {
  Client,
  ErrorCode,
  EvaluationContext,
  JsonObject,
  OpenFeature,
  StandardResolutionReasons,
} from '@openfeature/js-sdk';
import { GrpcTransport } from '@protobuf-ts/grpc-transport';
import type { UnaryCall } from '@protobuf-ts/runtime-rpc';
import { RpcError } from '@protobuf-ts/runtime-rpc';
import { Struct } from '../proto/ts/google/protobuf/struct';
import {
  EventStreamResponse,
  ResolveBooleanRequest,
  ResolveBooleanResponse,
  ResolveFloatRequest,
  ResolveFloatResponse,
  ResolveIntRequest,
  ResolveIntResponse,
  ResolveObjectRequest,
  ResolveObjectResponse,
  ResolveStringRequest,
  ResolveStringResponse,
} from '../proto/ts/schema/v1/schema';
import { ServiceClient } from '../proto/ts/schema/v1/schema.client';
import { EVENT_PROVIDER_READY, EVENT_CONFIGURATION_CHANGE } from './constants';
import { FlagdProvider } from './flagd-provider';
import { Codes, FlagChangeMessage, GRPCService } from './service/grpc/service';

const REASON = StandardResolutionReasons.STATIC;
const ERROR_REASON = StandardResolutionReasons.ERROR;

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
const OBJECT_VALUE = Struct.fromJson({
  [OBJECT_INNER_KEY]: OBJECT_INNER_VALUE,
});

const TEST_CONTEXT_KEY = 'context-key';
const TEST_CONTEXT_VALUE = 'context-value';
const TEST_CONTEXT = { [TEST_CONTEXT_KEY]: TEST_CONTEXT_VALUE };
const TEST_CONTEXT_CONVERTED = Struct.fromJsonString(JSON.stringify(TEST_CONTEXT));

describe(FlagdProvider.name, () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GRPC Service Options', () => {
    it('should use a unix socket', () => {
      new FlagdProvider({ socketPath: '/tmp/flagd.sock', cache: 'disabled' });
      expect(GrpcTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'unix:///tmp/flagd.sock' }));
    });

    it('should use a host and port', () => {
      new FlagdProvider({ cache: 'disabled' });
      expect(GrpcTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'localhost:8013' }));
    });
  });

  describe('basic flag resolution', () => {
    let client: Client;

    // mock ServiceClient to inject
    const basicServiceClientMock: ServiceClient = {
      eventStream: jest.fn(() => {
        return {
          responses: {
            onComplete: jest.fn(() => {
              return;
            }),
            onError: jest.fn(() => {
              return;
            }),
            onMessage: jest.fn(() => {
              return;
            }),
          },
        };
      }),
      resolveBoolean: jest.fn((): UnaryCall<ResolveBooleanRequest, ResolveBooleanResponse> => {
        return Promise.resolve({
          request: {} as ResolveBooleanRequest,
          response: {
            value: BOOLEAN_VALUE,
            variant: BOOLEAN_VARIANT,
            reason: REASON,
          },
        }) as unknown as UnaryCall<ResolveBooleanRequest, ResolveBooleanResponse>;
      }),
      resolveString: jest.fn((): UnaryCall<ResolveStringRequest, ResolveStringResponse> => {
        return Promise.resolve({
          request: {} as ResolveStringRequest,
          response: {
            value: STRING_VALUE,
            variant: STRING_VARIANT,
            reason: REASON,
          } as ResolveStringResponse,
        }) as unknown as UnaryCall<ResolveStringRequest, ResolveStringResponse>;
      }),
      resolveFloat: jest.fn((): UnaryCall<ResolveFloatRequest, ResolveFloatResponse> => {
        return Promise.resolve({
          request: {} as ResolveFloatRequest,
          response: {
            value: NUMBER_VALUE,
            variant: NUMBER_VARIANT,
            reason: REASON,
          } as ResolveFloatResponse,
        }) as unknown as UnaryCall<ResolveFloatRequest, ResolveFloatResponse>;
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
            reason: REASON,
          } as ResolveObjectResponse,
        }) as unknown as UnaryCall<ResolveObjectRequest, ResolveObjectResponse>;
      }),
    } as unknown as ServiceClient;

    beforeEach(() => {
      // inject our mock GRPCService and ServiceClient
      OpenFeature.setProvider(
        new FlagdProvider(undefined, new GRPCService({ host: '', port: 123, tls: false }, basicServiceClientMock))
      );
      client = OpenFeature.getClient('test');
    });

    describe(FlagdProvider.prototype.resolveBooleanEvaluation.name, () => {
      it(`should call ${ServiceClient.prototype.resolveBoolean} with key and context and return details`, async () => {
        const val = await client.getBooleanDetails(BOOLEAN_KEY, false, TEST_CONTEXT);
        expect(basicServiceClientMock.resolveBoolean).toHaveBeenCalledWith({
          flagKey: BOOLEAN_KEY,
          context: TEST_CONTEXT_CONVERTED,
        });
        expect(val.value).toEqual(BOOLEAN_VALUE);
        expect(val.variant).toEqual(BOOLEAN_VARIANT);
        expect(val.reason).toEqual(REASON);
      });
    });

    describe(FlagdProvider.prototype.resolveStringEvaluation.name, () => {
      it(`should call ${ServiceClient.prototype.resolveString} with key and context and return details`, async () => {
        const val = await client.getStringDetails(STRING_KEY, 'nope', TEST_CONTEXT);
        expect(basicServiceClientMock.resolveString).toHaveBeenCalledWith({
          flagKey: STRING_KEY,
          context: TEST_CONTEXT_CONVERTED,
        });
        expect(val.value).toEqual(STRING_VALUE);
        expect(val.variant).toEqual(STRING_VARIANT);
        expect(val.reason).toEqual(REASON);
      });
    });

    describe(FlagdProvider.prototype.resolveNumberEvaluation.name, () => {
      it(`should call ${ServiceClient.prototype.resolveFloat} with key and context and return details`, async () => {
        const val = await client.getNumberDetails(NUMBER_KEY, 0, TEST_CONTEXT);
        expect(basicServiceClientMock.resolveFloat).toHaveBeenCalledWith({
          flagKey: NUMBER_KEY,
          context: TEST_CONTEXT_CONVERTED,
        });
        expect(val.value).toEqual(NUMBER_VALUE);
        expect(val.variant).toEqual(NUMBER_VARIANT);
        expect(val.reason).toEqual(REASON);
      });
    });

    describe(FlagdProvider.prototype.resolveObjectEvaluation.name, () => {
      it(`should call ${ServiceClient.prototype.resolveObject} with key and context and return details`, async () => {
        const val = await client.getObjectDetails(OBJECT_KEY, {}, TEST_CONTEXT);
        expect(basicServiceClientMock.resolveObject).toHaveBeenCalledWith({
          flagKey: OBJECT_KEY,
          context: TEST_CONTEXT_CONVERTED,
        });
        expect(val.value).toEqual({ [OBJECT_INNER_KEY]: OBJECT_INNER_VALUE });
        expect(val.variant).toEqual(OBJECT_VARIANT);
        expect(val.reason).toEqual(REASON);
      });
    });

    describe('undefined in evaluation context', () => {
      it(`should not throw, call ${ServiceClient.prototype.resolveObject} with key and context and return details`, async () => {
        const val = await client.getBooleanDetails(BOOLEAN_KEY, false, {
          it: undefined,
        } as unknown as EvaluationContext);
        expect(basicServiceClientMock.resolveBoolean).toHaveBeenCalledWith({
          flagKey: BOOLEAN_KEY,
          context: Struct.fromJson({}),
        });
        expect(val.value).toEqual(BOOLEAN_VALUE);
        expect(val.variant).toEqual(BOOLEAN_VARIANT);
        expect(val.reason).toEqual(REASON);
      });
    });
  });

  describe('caching', () => {
    const STATIC_BOOLEAN_KEY_1 = 'staticBoolflagOne';
    const STATIC_BOOLEAN_KEY_2 = 'staticBoolflagTwo';
    const TARGETING_MATCH_BOOLEAN_KEY = 'targetingMatchBooleanKey';

    // ref to callback to fire to fake error messages to flagd
    let registeredOnErrorCallback: () => void;
    // ref to callback to fire to fake messages to flagd
    let registeredOnMessageCallback: (message: EventStreamResponse) => void;
    const responsesMock = {
      onComplete: jest.fn((callback) => {
        return;
      }),
      onError: jest.fn((callback) => {
        registeredOnErrorCallback = callback;
        return;
      }),
      onMessage: jest.fn((callback) => {
        registeredOnMessageCallback = callback;
        return;
      }),
    };

    // mock ServiceClient to inject
    const cacheServiceClientMock = {
      eventStream: jest.fn(() => {
        return {
          responses: responsesMock,
        };
      }),
      resolveBoolean: jest.fn(
        (req: ResolveBooleanRequest): UnaryCall<ResolveBooleanRequest, ResolveBooleanResponse> => {
          const response = {
            variant: BOOLEAN_VARIANT,
            value: true,
          } as unknown as ResolveBooleanResponse;

          // mock static vs targeting keys
          if (req.flagKey === STATIC_BOOLEAN_KEY_1 || req.flagKey === STATIC_BOOLEAN_KEY_2) {
            response.reason = StandardResolutionReasons.STATIC;
          } else {
            response.reason = StandardResolutionReasons.TARGETING_MATCH;
          }

          return Promise.resolve({
            request: {} as ResolveBooleanRequest,
            response,
          }) as unknown as UnaryCall<ResolveBooleanRequest, ResolveBooleanResponse>;
        }
      ),
    } as unknown as ServiceClient;

    describe('constructor', () => {
      it(`should call ${ServiceClient.prototype.eventStream} and register onMessageHandler`, async () => {
        new FlagdProvider(
          undefined,
          new GRPCService({ host: '', port: 123, tls: false, cache: 'lru' }, cacheServiceClientMock)
        );

        expect(cacheServiceClientMock.eventStream).toHaveBeenCalled();
      });
    });

    describe('cached resolution', () => {
      let client: Client;

      beforeAll(() => {
        OpenFeature.setProvider(
          new FlagdProvider(
            undefined,
            new GRPCService({ host: '', port: 123, tls: false, cache: 'lru' }, cacheServiceClientMock)
          )
        );
        // fire message saying provider is ready
        registeredOnMessageCallback({ type: EVENT_PROVIDER_READY });
        client = OpenFeature.getClient('caching-test');
      });

      it(`should cache STATIC flag`, async () => {
        const firstEval = await client.getBooleanDetails(STATIC_BOOLEAN_KEY_1, false);
        const secondEval = await client.getBooleanDetails(STATIC_BOOLEAN_KEY_1, false);
        expect(firstEval.reason).toEqual(StandardResolutionReasons.STATIC);
        expect(secondEval.reason).toEqual(StandardResolutionReasons.CACHED);
      });

      it(`should not cache TARGETING_MATCH flag`, async () => {
        const firstEval = await client.getBooleanDetails(TARGETING_MATCH_BOOLEAN_KEY, false);
        const secondEval = await client.getBooleanDetails(TARGETING_MATCH_BOOLEAN_KEY, false);
        expect(firstEval.reason).toEqual(StandardResolutionReasons.TARGETING_MATCH);
        expect(secondEval.reason).toEqual(StandardResolutionReasons.TARGETING_MATCH);
      });
    });

    describe('cache invalidation', () => {
      let client: Client;

      beforeAll(() => {
        OpenFeature.setProvider(
          new FlagdProvider(
            undefined,
            new GRPCService({ host: '', port: 123, tls: false, cache: 'lru' }, cacheServiceClientMock)
          )
        );
        // fire message saying provider is ready
        registeredOnMessageCallback({ type: EVENT_PROVIDER_READY });
        client = OpenFeature.getClient('caching-test');
      });

      beforeEach(async () => {
        // evaluate to cache both the static flags.
        await Promise.all([
          client.getBooleanDetails(STATIC_BOOLEAN_KEY_1, false),
          client.getBooleanDetails(STATIC_BOOLEAN_KEY_2, false),
        ]);
        const [flag1, flag2] = await Promise.all([
          client.getBooleanDetails(STATIC_BOOLEAN_KEY_1, false),
          client.getBooleanDetails(STATIC_BOOLEAN_KEY_2, false),
        ]);
        expect(flag1.reason).toEqual(StandardResolutionReasons.CACHED);
        expect(flag2.reason).toEqual(StandardResolutionReasons.CACHED);
      });

      describe('single key changed', () => {
        it(`should clear cache with flag change event`, async () => {
          // change only flag1
          const message: FlagChangeMessage = {
            flags: {
              [STATIC_BOOLEAN_KEY_1]: {
                flagKey: STATIC_BOOLEAN_KEY_1,
                type: 'update',
                source: '//my-source',
              },
            },
          };
          registeredOnMessageCallback({
            type: EVENT_CONFIGURATION_CHANGE,
            data: Struct.fromJson(message as JsonObject),
          });

          const [flag1, flag2] = await Promise.all([
            client.getBooleanDetails(STATIC_BOOLEAN_KEY_1, false),
            client.getBooleanDetails(STATIC_BOOLEAN_KEY_2, false),
          ]);

          // expect only flag1 to be purged
          expect(flag1.reason).toEqual(StandardResolutionReasons.STATIC);
          expect(flag2.reason).toEqual(StandardResolutionReasons.CACHED);
        });
      });

      describe('multiple keys changed', () => {
        it(`should clear cache with flag change event`, async () => {
          // change both flags
          const message: FlagChangeMessage = {
            flags: {
              [STATIC_BOOLEAN_KEY_1]: {
                flagKey: STATIC_BOOLEAN_KEY_1,
                type: 'update',
                source: '//my-source',
              },
              [STATIC_BOOLEAN_KEY_2]: {
                flagKey: STATIC_BOOLEAN_KEY_2,
                type: 'update',
                source: '//my-source',
              },
            },
          };
          registeredOnMessageCallback({
            type: EVENT_CONFIGURATION_CHANGE,
            data: Struct.fromJson(message as JsonObject),
          });

          const [flag1, flag2] = await Promise.all([
            client.getBooleanDetails(STATIC_BOOLEAN_KEY_1, false),
            client.getBooleanDetails(STATIC_BOOLEAN_KEY_2, false),
          ]);

          // expect both flags to be purged
          expect(flag1.reason).toEqual(StandardResolutionReasons.STATIC);
          expect(flag2.reason).toEqual(StandardResolutionReasons.STATIC);
        });
      });
    });

    describe('connection/re-connection', () => {
      it('should attempt to inital connection multiple times', async () => {
        new FlagdProvider(
          undefined,
          new GRPCService({ host: '', port: 123, tls: false, cache: 'lru' }, cacheServiceClientMock)
        );

        // fake some errors
        registeredOnErrorCallback();
        registeredOnErrorCallback();
        registeredOnErrorCallback();
        await new Promise((resolve) => setTimeout(resolve, 4000));

        registeredOnMessageCallback({ type: EVENT_PROVIDER_READY });
        // within 3 seconds, we should have seen at least 3 connect attempts.
        expect((cacheServiceClientMock.eventStream as jest.MockedFn<any>).mock.calls.length).toBeGreaterThanOrEqual(3);
      });

      it('should attempt re-connection multiple times', async () => {
        const provider = new FlagdProvider(
          undefined,
          new GRPCService({ host: '', port: 123, tls: false, cache: 'lru' }, cacheServiceClientMock)
        );

        registeredOnMessageCallback({ type: EVENT_PROVIDER_READY });
        await provider.streamConnection;
        // connect without issue initially
        expect(cacheServiceClientMock.eventStream).toHaveBeenCalledTimes(1);

        // fake some errors
        registeredOnErrorCallback();
        registeredOnErrorCallback();
        registeredOnErrorCallback();
        await new Promise((resolve) => setTimeout(resolve, 4000));

        // within 4 seconds, we should have seen at least 3 connect attempts.
        expect((cacheServiceClientMock.eventStream as jest.MockedFn<any>).mock.calls.length).toBeGreaterThanOrEqual(3);
      });
    });
  });

  describe('resolution errors', () => {
    let client: Client;
    const message = 'error message';

    // mock ServiceClient to inject
    const errServiceClientMock: ServiceClient = {
      eventStream: jest.fn(() => {
        return {
          responses: {
            onMessage: jest.fn(() => {
              return;
            }),
          },
        };
      }),
      resolveBoolean: jest.fn((): UnaryCall<ResolveBooleanRequest, ResolveBooleanResponse> => {
        return Promise.reject(new RpcError(message, Codes.DataLoss)) as unknown as UnaryCall<
          ResolveBooleanRequest,
          ResolveBooleanResponse
        >;
      }),
      resolveString: jest.fn((): UnaryCall<ResolveStringRequest, ResolveStringResponse> => {
        return Promise.reject(new RpcError(message, Codes.InvalidArgument)) as unknown as UnaryCall<
          ResolveStringRequest,
          ResolveStringResponse
        >;
      }),
      resolveFloat: jest.fn((): UnaryCall<ResolveFloatRequest, ResolveFloatResponse> => {
        return Promise.reject(new RpcError(message, Codes.NotFound)) as unknown as UnaryCall<
          ResolveFloatRequest,
          ResolveFloatResponse
        >;
      }),
      resolveInt: jest.fn((): UnaryCall<ResolveIntRequest, ResolveIntResponse> => {
        throw new Error('resolveInt should not be called'); // we never call this method, we resolveFloat for all numbers.
      }),
      resolveObject: jest.fn((): UnaryCall<ResolveObjectRequest, ResolveObjectResponse> => {
        return Promise.reject(new RpcError(message, Codes.Unavailable)) as unknown as UnaryCall<
          ResolveObjectRequest,
          ResolveObjectResponse
        >;
      }),
    } as unknown as ServiceClient;

    beforeEach(() => {
      // inject our mock GRPCService and ServiceClient
      OpenFeature.setProvider(
        new FlagdProvider(undefined, new GRPCService({ host: '', port: 123, tls: false }, errServiceClientMock))
      );
      client = OpenFeature.getClient('test');
    });

    describe(FlagdProvider.prototype.resolveBooleanEvaluation.name, () => {
      const DEFAULT = false;

      it('should default and add error and reason', async () => {
        const val = await client.getBooleanDetails(BOOLEAN_KEY, DEFAULT);
        expect(errServiceClientMock.resolveBoolean).toHaveBeenCalled();
        expect(val.value).toEqual(DEFAULT);
        expect(val.reason).toEqual(ERROR_REASON);
        expect(val.errorCode).toEqual(ErrorCode.PARSE_ERROR);
      });
    });

    describe(FlagdProvider.prototype.resolveStringEvaluation.name, () => {
      const DEFAULT = 'nope';

      it('should default and add error and reason', async () => {
        const val = await client.getStringDetails(STRING_KEY, DEFAULT);
        expect(errServiceClientMock.resolveString).toHaveBeenCalled();
        expect(val.value).toEqual(DEFAULT);
        expect(val.reason).toEqual(ERROR_REASON);
        expect(val.errorCode).toEqual(ErrorCode.TYPE_MISMATCH);
      });
    });

    describe(FlagdProvider.prototype.resolveNumberEvaluation.name, () => {
      const DEFAULT = 0;

      it('should default and add error and reason', async () => {
        const val = await client.getNumberDetails(NUMBER_KEY, DEFAULT);
        expect(errServiceClientMock.resolveFloat).toHaveBeenCalled();
        expect(val.value).toEqual(DEFAULT);
        expect(val.reason).toEqual(ERROR_REASON);
        expect(val.errorCode).toEqual(ErrorCode.FLAG_NOT_FOUND);
      });
    });

    describe(FlagdProvider.prototype.resolveObjectEvaluation.name, () => {
      const DEFAULT_INNER_KEY = 'uh';
      const DEFAULT_INNER_VALUE = 'oh';

      it('should default and add error and reason', async () => {
        const val = await client.getObjectDetails(OBJECT_KEY, {
          [DEFAULT_INNER_KEY]: DEFAULT_INNER_VALUE,
        });
        expect(errServiceClientMock.resolveObject).toHaveBeenCalled();
        expect(val.value).toEqual({ [DEFAULT_INNER_KEY]: DEFAULT_INNER_VALUE });
        expect(val.reason).toEqual(ERROR_REASON);
        expect(val.errorCode).toEqual(ErrorCode.FLAG_NOT_FOUND);
      });
    });
  });

  describe('undefined object value', () => {
    let client: Client;

    // mock ServiceClient to inject
    const undefinedObjectMock: ServiceClient = {
      eventStream: jest.fn(() => {
        return {
          responses: {
            onMessage: jest.fn(() => {
              return;
            }),
          },
        };
      }),
      resolveObject: jest.fn((): UnaryCall<ResolveObjectRequest, ResolveObjectResponse> => {
        return Promise.resolve({
          request: {} as ResolveObjectRequest,
          response: {
            value: undefined,
            reason: REASON,
          } as ResolveObjectResponse,
        }) as unknown as UnaryCall<ResolveObjectRequest, ResolveObjectResponse>;
      }),
    } as unknown as ServiceClient;

    beforeEach(() => {
      // inject our mock GRPCService and ServiceClient
      OpenFeature.setProvider(
        new FlagdProvider(undefined, new GRPCService({ host: '', port: 123, tls: false }, undefinedObjectMock))
      );
      client = OpenFeature.getClient('test');
    });

    describe(FlagdProvider.prototype.resolveObjectEvaluation.name, () => {
      const DEFAULT_INNER_KEY = 'some';
      const DEFAULT_INNER_VALUE = 'key';

      it('should default and throw correct error', async () => {
        const val = await client.getObjectDetails(OBJECT_KEY, {
          [DEFAULT_INNER_KEY]: DEFAULT_INNER_VALUE,
        });
        expect(undefinedObjectMock.resolveObject).toHaveBeenCalled();
        expect(val.value).toEqual({ [DEFAULT_INNER_KEY]: DEFAULT_INNER_VALUE });
        expect(val.reason).toEqual(ERROR_REASON);
        expect(val.errorCode).toEqual(ErrorCode.PARSE_ERROR);
      });
    });
  });
});

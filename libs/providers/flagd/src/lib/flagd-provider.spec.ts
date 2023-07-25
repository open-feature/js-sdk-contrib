import { ServiceError, status } from '@grpc/grpc-js';
import {
  Client,
  ErrorCode,
  EvaluationContext,
  OpenFeature,
  ProviderEvents,
  ProviderStatus,
  StandardResolutionReasons
} from '@openfeature/js-sdk';
import type { UnaryCall } from '@protobuf-ts/runtime-rpc';
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
  ServiceClient,
} from '../proto/ts/schema/v1/schema';
import { EVENT_CONFIGURATION_CHANGE, EVENT_PROVIDER_READY } from './constants';
import { FlagdProvider } from './flagd-provider';
import { FlagChangeMessage, GRPCService } from './service/grpc/service';

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
const OBJECT_VALUE = {
  [OBJECT_INNER_KEY]: OBJECT_INNER_VALUE,
};

const TEST_CONTEXT_KEY = 'context-key';
const TEST_CONTEXT_VALUE = 'context-value';
const TEST_CONTEXT = { [TEST_CONTEXT_KEY]: TEST_CONTEXT_VALUE };

describe(FlagdProvider.name, () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('basic flag resolution', () => {
    let client: Client;

    // mock ServiceClient to inject
    const basicServiceClientMock: ServiceClient = {
      eventStream: jest.fn(() => {
        return {
          on: jest.fn((event: string, callback: (message: unknown) => void) => {
            if (event === 'data') {
              callback({ type: EVENT_PROVIDER_READY });
            }
          }),
          destroy: jest.fn(),
        };
      }),
      resolveBoolean: jest.fn((request: ResolveBooleanRequest, callback: (error: ServiceError | null, response: ResolveBooleanResponse) => void) => {
        callback(null, {
          value: BOOLEAN_VALUE,
          variant: BOOLEAN_VARIANT,
          reason: REASON,
          metadata: {}
        });
      }),
      resolveString: jest.fn((request: ResolveStringRequest, callback: (error: ServiceError | null, response: ResolveStringResponse) => void) => {
        callback(null, {
          value: STRING_VALUE,
          variant: STRING_VARIANT,
          reason: REASON,
          metadata: {}
        });
      }),
      resolveFloat: jest.fn((request: ResolveFloatRequest, callback: (error: ServiceError | null, response: ResolveFloatResponse) => void) => {
        callback(null, {
          value: NUMBER_VALUE,
          variant: NUMBER_VARIANT,
          reason: REASON,
          metadata: {}
        });
      }),
      resolveInt: jest.fn((): UnaryCall<ResolveIntRequest, ResolveIntResponse> => {
        throw new Error('resolveInt should not be called'); // we never call this method, we resolveFloat for all numbers.
      }),
      resolveObject: jest.fn((request: ResolveObjectRequest, callback: (error: ServiceError | null, response: ResolveObjectResponse) => void) => {
        callback(null, {
          value: OBJECT_VALUE,
          variant: OBJECT_VARIANT,
          reason: REASON,
          metadata: {}
        });
      }),
    } as unknown as ServiceClient;

    beforeEach(() => {
      // inject our mock GRPCService and ServiceClient
      OpenFeature.setProvider('basic test',
        new FlagdProvider(undefined, undefined, new GRPCService({ host: '', port: 123, tls: false }, basicServiceClientMock))
      );
      client = OpenFeature.getClient('basic test');
    });

    describe(FlagdProvider.prototype.resolveBooleanEvaluation.name, () => {
      it(`should call ${ServiceClient.prototype.resolveBoolean} with key and context and return details`, async () => {
        const val = await client.getBooleanDetails(BOOLEAN_KEY, false, TEST_CONTEXT);
        expect(basicServiceClientMock.resolveBoolean).toHaveBeenCalledWith({
          flagKey: BOOLEAN_KEY,
          context: TEST_CONTEXT,
        }, expect.any(Function));
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
          context: TEST_CONTEXT,
        }, expect.any(Function));
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
          context: TEST_CONTEXT,
        }, expect.any(Function));
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
          context: TEST_CONTEXT,
        }, expect.any(Function));
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
          context: {},
        }, expect.any(Function));
        expect(val.value).toEqual(BOOLEAN_VALUE);
        expect(val.variant).toEqual(BOOLEAN_VARIANT);
        expect(val.reason).toEqual(REASON);
      });
    });
  });

  describe('basic flag resolution with zero values', () => {
    let client: Client;

    const basicServiceClientMock: ServiceClient = {
      eventStream: jest.fn(() => {
        return {
          on: jest.fn((event: string, callback: (message: unknown) => void) => {
            if (event === 'data') {
              callback({ type: EVENT_PROVIDER_READY });
            }
          }),
          destroy: jest.fn(),
        };
      }),
      resolveBoolean: jest.fn((request: ResolveBooleanRequest, callback: (error: ServiceError | null, response: ResolveBooleanResponse) => void) => {
        callback(null, {
          variant: BOOLEAN_VARIANT,
          reason: REASON,
          metadata: {}
        } as ResolveBooleanResponse);
      }),
      resolveString: jest.fn((request: ResolveStringRequest, callback: (error: ServiceError | null, response: ResolveStringResponse) => void) => {
        callback(null, {
          variant: STRING_VARIANT,
          reason: REASON,
          metadata: {}
        } as ResolveStringResponse);
      }),
      resolveFloat: jest.fn((request: ResolveFloatRequest, callback: (error: ServiceError | null, response: ResolveFloatResponse) => void) => {
        callback(null, {
          variant: NUMBER_VARIANT,
          reason: REASON,
          metadata: {}
        } as ResolveFloatResponse);
      }),
      resolveInt: jest.fn((): UnaryCall<ResolveIntRequest, ResolveIntResponse> => {
        throw new Error('resolveInt should not be called'); // we never call this method, we resolveFloat for all numbers.
      }),
      resolveObject: jest.fn((request: ResolveObjectRequest, callback: (error: ServiceError | null, response: ResolveObjectResponse) => void) => {
        callback(null, {
          variant: OBJECT_VARIANT,
          reason: REASON,
          metadata: {}
        } as ResolveObjectResponse);
      }),
    } as unknown as ServiceClient;

    beforeEach(() => {
      // inject our mock GRPCService and ServiceClient
      OpenFeature.setProvider('zero test',
        new FlagdProvider(undefined, undefined, new GRPCService({ host: '', port: 123, tls: false }, basicServiceClientMock))
      );
      client = OpenFeature.getClient('zero test');
    });

    describe(FlagdProvider.prototype.resolveBooleanEvaluation.name, () => {
      it(`should call ${ServiceClient.prototype.resolveBoolean} with key and context and return details`, async () => {
        const val = await client.getBooleanDetails(BOOLEAN_KEY, false, TEST_CONTEXT);
        expect(basicServiceClientMock.resolveBoolean).toHaveBeenCalledWith({
          flagKey: BOOLEAN_KEY,
          context: TEST_CONTEXT,
        }, expect.any(Function));
        expect(val.value).toEqual(false);
        expect(val.variant).toEqual(BOOLEAN_VARIANT);
        expect(val.reason).toEqual(REASON);
      });
    });

    describe(FlagdProvider.prototype.resolveStringEvaluation.name, () => {
      it(`should call ${ServiceClient.prototype.resolveString} with key and context and return details`, async () => {
        const val = await client.getStringDetails(STRING_KEY, '', TEST_CONTEXT);
        expect(basicServiceClientMock.resolveString).toHaveBeenCalledWith({
          flagKey: STRING_KEY,
          context: TEST_CONTEXT,
        }, expect.any(Function));
        expect(val.value).toEqual('');
        expect(val.variant).toEqual(STRING_VARIANT);
        expect(val.reason).toEqual(REASON);
      });
    });

    describe(FlagdProvider.prototype.resolveNumberEvaluation.name, () => {
      it(`should call ${ServiceClient.prototype.resolveFloat} with key and context and return details`, async () => {
        const val = await client.getNumberDetails(NUMBER_KEY, 0, TEST_CONTEXT);
        expect(basicServiceClientMock.resolveFloat).toHaveBeenCalledWith({
          flagKey: NUMBER_KEY,
          context: TEST_CONTEXT,
        }, expect.any(Function));
        expect(val.value).toEqual(0);
        expect(val.variant).toEqual(NUMBER_VARIANT);
        expect(val.reason).toEqual(REASON);
      });
    });

    describe(FlagdProvider.prototype.resolveObjectEvaluation.name, () => {
      it(`should call ${ServiceClient.prototype.resolveObject} with key and context and return details`, async () => {
        const val = await client.getObjectDetails(OBJECT_KEY, {}, TEST_CONTEXT);
        expect(basicServiceClientMock.resolveObject).toHaveBeenCalledWith({
          flagKey: OBJECT_KEY,
          context: TEST_CONTEXT,
        }, expect.any(Function));
        expect(val.value).toEqual({});
        expect(val.variant).toEqual(OBJECT_VARIANT);
        expect(val.reason).toEqual(REASON);
      });
    });
  });

  describe('streaming', () => {
    const STATIC_BOOLEAN_KEY_1 = 'staticBoolflagOne';
    const STATIC_BOOLEAN_KEY_2 = 'staticBoolflagTwo';
    const TARGETING_MATCH_BOOLEAN_KEY = 'targetingMatchBooleanKey';

    // ref to callback to fire to fake error messages to flagd
    let registeredOnErrorCallback: () => void;
    // ref to callback to fire to fake messages to flagd
    let registeredOnMessageCallback: (message: EventStreamResponse) => void;
    const streamMock = {
      on: jest.fn((event: string, callback: (message?: unknown) => void) => {
        if (event === 'data') {
          registeredOnMessageCallback = callback;
        } else if (event === 'error') {
          registeredOnErrorCallback = callback;
        }
      }),
      destroy: jest.fn(),
    };

    // mock ServiceClient to inject
    const streamingServiceClientMock = {
      eventStream: jest.fn(() => {
        return streamMock;
      }),
      resolveBoolean: jest.fn((req: ResolveBooleanRequest, callback: (error: ServiceError | null, response: ResolveBooleanResponse) => void) => {
        const response = {
          variant: BOOLEAN_VARIANT,
          value: true,
        } as ResolveBooleanResponse;

        // mock static vs targeting keys
        if (req.flagKey === STATIC_BOOLEAN_KEY_1 || req.flagKey === STATIC_BOOLEAN_KEY_2) {
          response.reason = StandardResolutionReasons.STATIC;
        } else {
          response.reason = StandardResolutionReasons.TARGETING_MATCH;
        }
        
        callback(null, response);
      }),
    } as unknown as ServiceClient;

    describe(FlagdProvider.prototype.initialize, () => {
      it(`should call ${ServiceClient.prototype.eventStream} and register onMessageHandler`, (done) => {
        new FlagdProvider(
          undefined,
          undefined,
          new GRPCService({ host: '', port: 123, tls: false, cache: 'lru' }, streamingServiceClientMock)
        ).initialize().then(() => {
          try {
            expect(streamingServiceClientMock.eventStream).toHaveBeenCalled();
            done();
          } catch (err) {
            done(err);
          }
        });
        // fire message saying provider is ready
        registeredOnMessageCallback({ type: EVENT_PROVIDER_READY, data: {} });
      });
    });

    describe('change event received', () => {
      let client: Client;

      beforeAll(() => {
        OpenFeature.setProvider('change events test',
          new FlagdProvider(
            undefined,
            undefined,
            new GRPCService({ host: '', port: 123, tls: false, cache: 'lru' }, streamingServiceClientMock)
          )
        );
        // fire message saying provider is ready
        registeredOnMessageCallback({ type: EVENT_PROVIDER_READY, data: {} });
        client = OpenFeature.getClient('change events test');
      });

      it(`should fire event emitter`, (done) => {
        const flag1 = 'flag1';
        const flag2 = 'flag2';
        client.addHandler(ProviderEvents.ConfigurationChanged, (details) => {
          try {
            expect(details?.flagsChanged).toContain(flag1);
            expect(details?.flagsChanged).toContain(flag2);
            done();
          } catch (err) {
            done(err);
          }
        });
        const data: FlagChangeMessage = {
          flags: {
            [flag1]: {
              type: 'update',
              source: 'some-source',
              flagKey: flag1
            },
            [flag2]: {
              type: 'update',
              source: 'some-other-source',
              flagKey: flag2
            },
          }
        };
        
        // mock change event from flagd
        registeredOnMessageCallback({ type: EVENT_CONFIGURATION_CHANGE, data });
      });
    });

    describe('cached resolution', () => {
      let client: Client;

      beforeAll(() => {
        OpenFeature.setProvider('streaming test',
          new FlagdProvider(
            undefined,
            undefined,
            new GRPCService({ host: '', port: 123, tls: false, cache: 'lru' }, streamingServiceClientMock)
          )
        );
        // fire message saying provider is ready
        registeredOnMessageCallback({ type: EVENT_PROVIDER_READY, data: {} });
        client = OpenFeature.getClient('streaming test');
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
        OpenFeature.setProvider('cache invalidation',
          new FlagdProvider(
            undefined,
            undefined,
            new GRPCService({ host: '', port: 123, tls: false, cache: 'lru' }, streamingServiceClientMock)
          )
        );
        // fire message saying provider is ready
        registeredOnMessageCallback({ type: EVENT_PROVIDER_READY, data: {} });
        client = OpenFeature.getClient('cache invalidation');
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
            data: message,
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
            data: message,
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
      it('should attempt to inital connection multiple times', (done) => {
        const provider = new FlagdProvider(
          undefined,
          undefined,
          new GRPCService({ host: '', port: 123, tls: false, cache: 'lru' }, streamingServiceClientMock)
        );
        provider.initialize();

        // fake some errors
        registeredOnErrorCallback();
        registeredOnErrorCallback();
        registeredOnErrorCallback();

        // status should be ERROR
        expect(provider.status).toEqual(ProviderStatus.ERROR);

        // connect finally
        registeredOnMessageCallback({ type: EVENT_PROVIDER_READY, data: {} });

        new Promise((resolve) => setTimeout(resolve, 4000)).then(() => {
          try {
            // within 3 seconds, we should have seen at least 3 connect attempts, and provider should be READY.
            expect((streamingServiceClientMock.eventStream as jest.MockedFn<any>).mock.calls.length).toBeGreaterThanOrEqual(3);
            expect(provider.status).toEqual(ProviderStatus.READY);
            done();
          } catch (err) {
            done(err);
          }
        });
      });

      it('should attempt re-connection multiple times', (done) => {
        const provider = new FlagdProvider(
          undefined,
          undefined,
          new GRPCService({ host: '', port: 123, tls: false, cache: 'lru' }, streamingServiceClientMock)
        );
        provider.initialize();

        // connect without issue initially
        registeredOnMessageCallback({ type: EVENT_PROVIDER_READY, data: {} });

        // status should be READY
        expect(provider.status).toEqual(ProviderStatus.READY);

        // fake some errors
        registeredOnErrorCallback();
        registeredOnErrorCallback();
        registeredOnErrorCallback();

        // status should be ERROR
        expect(provider.status).toEqual(ProviderStatus.ERROR);

        new Promise((resolve) => setTimeout(resolve, 4000)).then(() => {
          try {
            // within 4 seconds, we should have seen at least 3 connect attempts and status should be READY.
            expect((streamingServiceClientMock.eventStream as jest.MockedFn<any>).mock.calls.length).toBeGreaterThanOrEqual(3);
            expect(provider.status).toEqual(ProviderStatus.READY);
            done();
          } catch (err) {
            done(err);
          }
        });
      });
    });
  });

  describe('resolution errors', () => {
    let client: Client;
    const details = 'error message';

    // mock ServiceClient to inject
    const errServiceClientMock: ServiceClient = {
      eventStream: jest.fn(() => {
        return {
          on: jest.fn((event: string, callback: (message: unknown) => void) => {
            if (event === 'data') {
              callback({ type: EVENT_PROVIDER_READY });
            }
          }),
          destroy: jest.fn(),
        };
      }),
      resolveBoolean: jest.fn((request: ResolveBooleanRequest, callback: (error: ServiceError | null, response: ResolveBooleanResponse) => void) => {
        callback({ code: status.DATA_LOSS, details } as ServiceError, {} as ResolveBooleanResponse);
      }),
      resolveString: jest.fn((request: ResolveStringRequest, callback: (error: ServiceError | null, response: ResolveStringResponse) => void) => {
        callback({ code: status.INVALID_ARGUMENT, details } as ServiceError, {} as ResolveStringResponse);

      }),
      resolveFloat: jest.fn((request: ResolveFloatRequest, callback: (error: ServiceError | null, response: ResolveFloatResponse) => void) => {
        callback({ code: status.NOT_FOUND, details } as ServiceError, {} as ResolveFloatResponse);

      }),
      resolveInt: jest.fn((): UnaryCall<ResolveIntRequest, ResolveIntResponse> => {
        throw new Error('resolveInt should not be called'); // we never call this method, we resolveFloat for all numbers.
      }),
      resolveObject: jest.fn((request: ResolveObjectRequest, callback: (error: ServiceError | null, response: ResolveObjectResponse) => void) => {
        callback({ code: status.UNAVAILABLE, details } as ServiceError, {} as ResolveObjectResponse);

      }),
    } as unknown as ServiceClient;

    beforeEach(() => {
      // inject our mock GRPCService and ServiceClient
      OpenFeature.setProvider('errors test',
        new FlagdProvider(undefined, undefined, new GRPCService({ host: '', port: 123, tls: false }, errServiceClientMock))
      );
      client = OpenFeature.getClient('errors test');
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

  describe('shutdown', () => {
    const closeMock = jest.fn();

    // mock ServiceClient to inject
    const errServiceClientMock: ServiceClient = {
      eventStream: jest.fn(() => {
        return {
          on: jest.fn((event: string, callback: (message: unknown) => void) => {
            if (event === 'data') {
              callback({ type: EVENT_PROVIDER_READY });
            }
          }),
          destroy: closeMock,
        };
      }),
      
    } as unknown as ServiceClient;

    beforeEach(() => {
      OpenFeature.setProvider('shutdown test',
        new FlagdProvider(undefined, undefined, new GRPCService({ host: '', port: 123, tls: false }, errServiceClientMock))
      );
    });

    describe(FlagdProvider.prototype.onClose.name, () => {
      it('should call service disconnect', async () => {
        await OpenFeature.close();
        expect(closeMock).toHaveBeenCalled();
      });
    });
  });
});

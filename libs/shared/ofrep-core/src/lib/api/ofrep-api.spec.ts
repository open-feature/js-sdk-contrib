import { ErrorCode, StandardResolutionReasons } from '@openfeature/core';
import { server } from '../../test/mock-service-worker';
import { TEST_FLAG_METADATA, TEST_FLAG_SET_METADATA } from '../../test/test-constants';
import type {
  BulkEvaluationFailureResponse,
  BulkEvaluationSuccessResponse,
  EvaluationFailureResponse,
  EvaluationSuccessResponse,
} from '../model';
import {
  OFREPApiFetchError,
  OFREPApiTooManyRequestsError,
  OFREPApiUnauthorizedError,
  OFREPApiUnexpectedResponseError,
  OFREPForbiddenError,
} from './errors';
import { OFREPApi } from './ofrep-api';

describe('OFREPApi', () => {
  let api: OFREPApi;

  beforeAll(() => {
    server.listen();
  });
  beforeEach(() => {
    api = new OFREPApi({
      baseUrl: 'https://localhost:8080',
      // Short timeout to speed up tests
      timeoutMs: 500,
    });
  });
  afterEach(() => {
    server.resetHandlers();
  });
  afterAll(() => {
    server.close();
  });

  describe('abort controller', () => {
    it('throw OFREPApiFetchError on timed out requests', async () => {
      try {
        await api.postEvaluateFlag('my-flag', { context: { errors: { slowRequest: true } } });
      } catch (err) {
        expect((err as { cause: DOMException })?.cause?.name).toEqual('TimeoutError');
      }
    });
  });

  describe('mock timers', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    describe('postEvaluateFlags should', () => {
      it('throw OFREPApiFetchError on network error', async () => {
        await expect(() => api.postEvaluateFlag('my-flag', { context: { errors: { network: true } } })).rejects.toThrow(
          OFREPApiFetchError,
        );
      });

      it('throw OFREPApiUnexpectedResponseError on any error code without EvaluationFailureResponse body', async () => {
        await expect(() =>
          api.postEvaluateFlag('my-flag', { context: { errors: { generic400: true } } }),
        ).rejects.toThrow(OFREPApiUnexpectedResponseError);
      });

      it('throw OFREPForbiddenError on 401 response', async () => {
        await expect(() => api.postEvaluateFlag('my-flag', { context: { errors: { 401: true } } })).rejects.toThrow(
          OFREPApiUnauthorizedError,
        );
      });

      it('throw OFREPForbiddenError on 403 response', async () => {
        await expect(() => api.postEvaluateFlag('my-flag', { context: { errors: { 403: true } } })).rejects.toThrow(
          OFREPForbiddenError,
        );
      });

      it('throw OFREPApiTooManyRequestsError on 429 response', async () => {
        await expect(() => api.postEvaluateFlag('my-flag', { context: { errors: { 429: true } } })).rejects.toThrow(
          OFREPApiTooManyRequestsError,
        );
      });

      it('parse numeric Retry-After header correctly on 429 response', async () => {
        jest.setSystemTime(new Date('2018-01-27'));

        try {
          await api.postEvaluateFlag('my-flag', { context: { errors: { 429: true } } });
        } catch (error) {
          if (!(error instanceof OFREPApiTooManyRequestsError)) {
            throw new Error('Expected OFREPApiTooManyRequestsError');
          }

          expect(error.retryAfterSeconds).toEqual(2000);
          expect(error.retryAfterDate).toEqual(new Date('2018-01-27T00:33:20.000Z'));
        }
      });

      it('parse date Retry-After header correctly on 429 response', async () => {
        jest.setSystemTime(new Date('2018-01-27'));

        try {
          await api.postEvaluateFlag('my-flag', { context: { errors: { 429: 'Sat, 27 Jan 2018 07:28:00 GMT' } } });
        } catch (error) {
          if (!(error instanceof OFREPApiTooManyRequestsError)) {
            throw new Error('Expected OFREPApiTooManyRequestsError');
          }

          expect(error.retryAfterSeconds).toEqual(null);
          expect(error.retryAfterDate).toEqual(new Date('2018-01-27T07:28:00.000Z'));
        }
      });

      it('ignore Retry-After header if it is not valid on 429 response', async () => {
        jest.setSystemTime(new Date('2018-01-27'));

        try {
          await api.postEvaluateFlag('my-flag', { context: { errors: { 429: 'abcdefg' } } });
        } catch (error) {
          if (!(error instanceof OFREPApiTooManyRequestsError)) {
            throw new Error('Expected OFREPApiTooManyRequestsError');
          }

          expect(error.retryAfterSeconds).toEqual(null);
          expect(error.retryAfterDate).toEqual(null);
        }
      });

      it('send empty request body if context is not given', async () => {
        const result = await api.postEvaluateFlag('my-flag');
        expect(result.httpStatus).toEqual(200);
      });

      it('send evaluation context in request body', async () => {
        const result = await api.postEvaluateFlag('context-in-metadata', {
          context: {
            targetingKey: 'user-1',
            key1: 'value1',
          },
        });

        if (result.httpStatus !== 200) {
          throw new Error('Received unexpected HTTP status');
        }

        expect(result.value.metadata).toEqual(TEST_FLAG_METADATA);
      });

      it('return HTTP status in result', async () => {
        const result = await api.postEvaluateFlag('my-flag');
        expect(result.httpStatus).toEqual(200);
      });

      it('return EvaluationFailureResponse response as value on HTTP 400', async () => {
        const result = await api.postEvaluateFlag('my-flag', { context: { errors: { notFound: true } } });
        if (result.httpStatus !== 404) {
          throw new Error('Received unexpected HTTP status');
        }

        expect(result.value).toEqual({
          key: 'my-flag',
          errorCode: ErrorCode.FLAG_NOT_FOUND,
          metadata: TEST_FLAG_METADATA,
        } satisfies EvaluationFailureResponse);
      });

      it('return EvaluationFailureResponse response as value on HTTP 400', async () => {
        const result = await api.postEvaluateFlag('my-flag', { context: { errors: { notFound: true } } });
        if (result.httpStatus !== 404) {
          throw new Error('Received unexpected HTTP status');
        }

        expect(result.value).toEqual({
          key: 'my-flag',
          errorCode: ErrorCode.FLAG_NOT_FOUND,
          metadata: TEST_FLAG_METADATA,
        } satisfies EvaluationFailureResponse);
      });

      it('determine value type based on HTTP status', async () => {
        const result = await api.postEvaluateFlag('my-flag');
        expect(result.httpStatus).toEqual(200);

        // This is to check if the value type is determined by http status code
        if (result.httpStatus === 200) {
          expect(result.value.value).toBeDefined();
        } else {
          expect(result.value.errorCode).toBeDefined();
        }
      });

      it('return EvaluationSuccessResponse response as value on successful evaluation', async () => {
        const result = await api.postEvaluateFlag('my-flag', { context: { targetingKey: 'user' } });
        expect(result.httpStatus).toEqual(200);
        expect(result.value).toEqual({
          key: 'my-flag',
          reason: StandardResolutionReasons.TARGETING_MATCH,
          value: true,
          variant: 'default',
          metadata: TEST_FLAG_METADATA,
        } satisfies EvaluationSuccessResponse);
      });

      it('send query params with request', async () => {
        api = new OFREPApi({ baseUrl: 'https://localhost:8080', query: new URLSearchParams({ scope: '123' }) });
        const result = await api.postEvaluateFlag('my-flag', { context: { targetingKey: 'user' } });
        expect(result.httpStatus).toEqual(200);
        expect(result.value).toEqual({
          key: 'my-flag',
          reason: StandardResolutionReasons.TARGETING_MATCH,
          value: true,
          variant: 'scoped',
          metadata: TEST_FLAG_METADATA,
        } satisfies EvaluationSuccessResponse);
      });
    });

    describe('postBulkEvaluateFlags should', () => {
      it('throw OFREPApiFetchError on network error', async () => {
        await expect(() => api.postBulkEvaluateFlags({ context: { errors: { network: true } } })).rejects.toThrow(
          OFREPApiFetchError,
        );
      });

      it('throw OFREPApiUnexpectedResponseError on any error code without EvaluationFailureResponse body', async () => {
        await expect(() => api.postBulkEvaluateFlags({ context: { errors: { generic400: true } } })).rejects.toThrow(
          OFREPApiUnexpectedResponseError,
        );
      });

      it('throw OFREPForbiddenError on 401 response', async () => {
        await expect(() => api.postBulkEvaluateFlags({ context: { errors: { 401: true } } })).rejects.toThrow(
          OFREPApiUnauthorizedError,
        );
      });

      it('throw OFREPForbiddenError on 403 response', async () => {
        await expect(() => api.postBulkEvaluateFlags({ context: { errors: { 403: true } } })).rejects.toThrow(
          OFREPForbiddenError,
        );
      });

      it('throw OFREPApiTooManyRequestsError on 429 response', async () => {
        await expect(() => api.postBulkEvaluateFlags({ context: { errors: { 429: true } } })).rejects.toThrow(
          OFREPApiTooManyRequestsError,
        );
      });

      it('send empty request body if context is not given', async () => {
        const result = await api.postBulkEvaluateFlags();
        expect(result.httpStatus).toEqual(200);
      });

      it('send evaluation context in request body', async () => {
        const result = await api.postBulkEvaluateFlags({
          context: {
            targetingKey: 'user-1',
            key1: 'value1',
          },
        });

        if (result.httpStatus !== 200) {
          throw new Error('Received unexpected HTTP status');
        }

        expect(result.value).toEqual({
          metadata: TEST_FLAG_SET_METADATA,
          flags: [
            {
              key: 'bool-flag',
              metadata: TEST_FLAG_METADATA,
              value: true,
              reason: StandardResolutionReasons.STATIC,
              variant: 'variantA',
            },
            {
              key: 'object-flag',
              metadata: TEST_FLAG_METADATA,
              value: {
                complex: true,
                nested: {
                  also: true,
                },
              },
            },
            {
              key: 'flag-without-value',
              metadata: {
                booleanKey: true,
                numberKey: 1,
                stringKey: 'string',
              },
              reason: 'DISABLED',
              variant: 'emptyVariant',
            },
          ],
        } satisfies BulkEvaluationSuccessResponse);
      });

      it('return HTTP status in result', async () => {
        const result = await api.postBulkEvaluateFlags();
        expect(result.httpStatus).toEqual(200);
      });

      it('return EvaluationFailureResponse response as value on failed evaluation', async () => {
        const result = await api.postBulkEvaluateFlags({ context: { errors: { targetingMissing: true } } });
        if (result.httpStatus !== 400) {
          throw new Error('Received unexpected HTTP status');
        }

        expect(result.value).toEqual({
          errorCode: ErrorCode.TARGETING_KEY_MISSING,
        } satisfies BulkEvaluationFailureResponse);
      });

      it('determine value type based on HTTP status', async () => {
        const result = await api.postBulkEvaluateFlags();
        expect(result.httpStatus).toEqual(200);

        // This is to check if the value type is determined by http status code
        if (result.httpStatus === 200) {
          expect(result.value.flags).toBeDefined();
        } else if (result.httpStatus === 304) {
          expect(result.value).not.toBeDefined();
        } else {
          expect(result.value.errorCode).toBeDefined();
        }
      });

      it('return BulkEvaluationNotModified response as value on 304', async () => {
        api = new OFREPApi({ baseUrl: 'https://localhost:8080', headers: [['If-None-Match', '1234']] });
        const result = await api.postBulkEvaluateFlags(undefined);
        expect(result.httpStatus).toEqual(304);
        expect(result.value).not.toBeDefined();
      });

      it('send query params with request', async () => {
        api = new OFREPApi({ baseUrl: 'https://localhost:8080', query: new URLSearchParams({ scope: '123' }) });
        const result = await api.postBulkEvaluateFlags();
        expect(result.httpStatus).toEqual(200);
        expect(result.value).toEqual({
          metadata: TEST_FLAG_SET_METADATA,
          flags: [
            {
              key: 'other-flag',
              value: true,
            },
          ],
        });
      });

      it('return BulkEvaluationSuccessResponse response as value on successful evaluation', async () => {
        const result = await api.postBulkEvaluateFlags();
        expect(result.httpStatus).toEqual(200);
        expect(result.value).toEqual({
          metadata: TEST_FLAG_SET_METADATA,
          flags: [
            {
              key: 'bool-flag',
              metadata: TEST_FLAG_METADATA,
              value: true,
              reason: StandardResolutionReasons.STATIC,
              variant: 'variantA',
            },
            {
              key: 'object-flag',
              metadata: TEST_FLAG_METADATA,
              value: {
                complex: true,
                nested: {
                  also: true,
                },
              },
            },
            {
              key: 'flag-without-value',
              metadata: {
                booleanKey: true,
                numberKey: 1,
                stringKey: 'string',
              },
              reason: 'DISABLED',
              variant: 'emptyVariant',
            },
          ],
        });
      });
    });
  });
});

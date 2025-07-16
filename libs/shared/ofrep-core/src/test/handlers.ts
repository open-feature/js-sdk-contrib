import type { StrictResponse } from 'msw';
import { http, HttpResponse } from 'msw';
import type { BulkEvaluationResponse, EvaluationFailureResponse, EvaluationRequest, EvaluationResponse } from '../lib';
import { TEST_FLAG_METADATA, TEST_FLAG_SET_METADATA } from './test-constants';
import { ErrorCode, StandardResolutionReasons } from '@openfeature/core';

export const handlers = [
  http.post<{ key: string }, EvaluationRequest, EvaluationResponse>(
    'https://localhost:8080/ofrep/v1/evaluate/flags/:key',
    async (info) => {
      const requestBody = await info.request.json();
      if (!requestBody) {
        throw HttpResponse.text(undefined, { status: 400 });
      }

      const contentTypeHeader = info.request.headers.get('Content-Type');
      if (contentTypeHeader?.toLowerCase() !== 'application/json; charset=utf-8') {
        throw HttpResponse.text('Wrong content type', { status: 415 });
      }

      const authHeader = info.request.headers.get('Authorization');
      const expectedAuthHeader = requestBody.context?.['expectedAuthHeader'] ?? null;

      const errors = requestBody.context?.['errors'] as Record<string, boolean> | undefined;
      if (errors?.['slowRequest']) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        throw HttpResponse.text(undefined, { status: 500 });
      }

      if (errors?.['network']) {
        throw HttpResponse.error();
      }

      if (errors?.['generic400']) {
        throw HttpResponse.json({ metadata: TEST_FLAG_METADATA }, { status: 400 });
      }

      if (errors?.['401'] || expectedAuthHeader !== authHeader) {
        throw HttpResponse.json({ metadata: TEST_FLAG_METADATA }, { status: 401 });
      }

      if (errors?.['403']) {
        throw HttpResponse.json({ metadata: TEST_FLAG_METADATA }, { status: 403 });
      }

      if (errors?.['metadata404']) {
        throw HttpResponse.json(
          {
            key: info.params.key,
            errorCode: ErrorCode.FLAG_NOT_FOUND,
            metadata: TEST_FLAG_METADATA,
          },
          { status: 404 },
        );
      }

      if (errors?.['429'] === true) {
        throw HttpResponse.json({ metadata: TEST_FLAG_METADATA }, { status: 429, headers: { 'Retry-After': '2000' } });
      }

      if (typeof errors?.['429'] === 'string') {
        throw HttpResponse.json(
          { metadata: TEST_FLAG_METADATA },
          { status: 429, headers: { 'Retry-After': errors?.['429'] } },
        );
      }

      if (errors?.['parseError']) {
        return HttpResponse.json<EvaluationFailureResponse>(
          {
            key: info.params.key,
            errorCode: ErrorCode.PARSE_ERROR,
            metadata: TEST_FLAG_METADATA,
          },
          { status: 400 },
        );
      }

      if (errors?.['targetingMissing']) {
        return HttpResponse.json<EvaluationFailureResponse>(
          {
            key: info.params.key,
            errorCode: ErrorCode.TARGETING_KEY_MISSING,
            metadata: TEST_FLAG_METADATA,
          },
          { status: 400 },
        );
      }

      if (errors?.['invalidContext']) {
        return HttpResponse.json<EvaluationFailureResponse>(
          {
            key: info.params.key,
            errorCode: ErrorCode.INVALID_CONTEXT,
            metadata: TEST_FLAG_METADATA,
          },
          { status: 400 },
        );
      }

      if (errors?.['notFound']) {
        return HttpResponse.json<EvaluationFailureResponse>(
          {
            key: info.params.key,
            errorCode: ErrorCode.FLAG_NOT_FOUND,
            metadata: TEST_FLAG_METADATA,
          },
          { status: 404 },
        );
      }

      if (errors?.['general']) {
        return HttpResponse.json<EvaluationFailureResponse>(
          {
            key: info.params.key,
            errorCode: ErrorCode.GENERAL,
            metadata: TEST_FLAG_METADATA,
          },
          { status: 400 },
        );
      }

      const scopeValue = new URL(info.request.url).searchParams.get('scope');
      const key = info.params.key;
      const reason = key.includes('null-value')
        ? StandardResolutionReasons.DEFAULT
        : requestBody.context?.targetingKey
          ? StandardResolutionReasons.TARGETING_MATCH
          : StandardResolutionReasons.STATIC;

      const value = key.includes('null-value') ? null : true;
      const variant = key.includes('null-value') ? undefined : scopeValue ? 'scoped' : 'default';

      return HttpResponse.json<EvaluationResponse>({
        key: info.params.key,
        reason,
        variant,
        value,
        metadata: TEST_FLAG_METADATA,
      });
    },
  ),

  http.post<{ key: string }, EvaluationRequest, BulkEvaluationResponse>(
    'https://localhost:8080/ofrep/v1/evaluate/flags',
    async (info) => {
      const requestBody = await info.request.json();
      if (!requestBody) {
        throw HttpResponse.text(undefined, { status: 400 });
      }

      const contentTypeHeader = info.request.headers.get('Content-Type');
      if (contentTypeHeader?.toLowerCase() !== 'application/json; charset=utf-8') {
        throw HttpResponse.text('Wrong content type', { status: 415 });
      }

      const authHeader = info.request.headers.get('Authorization');
      const expectedAuthHeader = requestBody.context?.['expectedAuthHeader'] ?? null;

      const errors = requestBody.context?.['errors'] as Record<string, boolean> | undefined;
      if (errors?.['slowRequest']) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        throw HttpResponse.text(undefined, { status: 500 });
      }

      if (errors?.['network']) {
        throw HttpResponse.error();
      }

      if (errors?.['generic400']) {
        throw HttpResponse.text(undefined, { status: 400 });
      }

      if (errors?.['401'] || expectedAuthHeader !== authHeader) {
        throw HttpResponse.text(undefined, { status: 401 });
      }

      if (errors?.['403']) {
        throw HttpResponse.text(undefined, { status: 403 });
      }

      if (errors?.['429']) {
        throw HttpResponse.text(undefined, { status: 429, headers: { 'Retry-After': '1' } });
      }

      if (errors?.['parseError']) {
        return HttpResponse.json<EvaluationFailureResponse>(
          {
            key: info.params.key,
            errorCode: ErrorCode.PARSE_ERROR,
          },
          { status: 400 },
        );
      }

      if (errors?.['targetingMissing']) {
        return HttpResponse.json<EvaluationFailureResponse>(
          {
            key: info.params.key,
            errorCode: ErrorCode.TARGETING_KEY_MISSING,
          },
          { status: 400 },
        );
      }

      if (errors?.['invalidContext']) {
        return HttpResponse.json<EvaluationFailureResponse>(
          {
            key: info.params.key,
            errorCode: ErrorCode.INVALID_CONTEXT,
          },
          { status: 400 },
        );
      }

      if (errors?.['notFound']) {
        return HttpResponse.json<EvaluationFailureResponse>(
          {
            key: info.params.key,
            errorCode: ErrorCode.FLAG_NOT_FOUND,
          },
          { status: 404 },
        );
      }

      if (errors?.['general']) {
        return HttpResponse.json<EvaluationFailureResponse>(
          {
            key: info.params.key,
            errorCode: ErrorCode.GENERAL,
          },
          { status: 400 },
        );
      }

      if (errors?.['flagInError']) {
        return HttpResponse.json<BulkEvaluationResponse>(
          {
            flags: [
              {
                key: 'bool-flag',
                value: true,
                metadata: TEST_FLAG_METADATA,
                variant: 'variantA',
                reason: StandardResolutionReasons.STATIC,
              },
              {
                key: 'parse-error',
                errorCode: ErrorCode.PARSE_ERROR,
                errorDetails: 'custom error details',
              },
              {
                key: 'flag-not-found',
                errorCode: ErrorCode.FLAG_NOT_FOUND,
                errorDetails: 'custom error details',
              },
              {
                key: 'targeting-key-missing',
                errorCode: ErrorCode.TARGETING_KEY_MISSING,
                errorDetails: 'custom error details',
              },
              {
                key: 'targeting-key-missing',
                errorCode: ErrorCode.TARGETING_KEY_MISSING,
                errorDetails: 'custom error details',
              },
              {
                key: 'invalid-context',
                errorCode: ErrorCode.INVALID_CONTEXT,
                errorDetails: 'custom error details',
              },
              {
                key: 'general-error',
                errorCode: ErrorCode.GENERAL,
                errorDetails: 'custom error details',
              },
              {
                key: 'unknown-error',
                errorCode: 'UNKNOWN_ERROR' as ErrorCode,
                errorDetails: 'custom error details',
              },
            ],
          },
          { headers: { etag: '123' } },
        );
      }

      const etag = info.request.headers.get('If-None-Match');
      const changeConfig = requestBody.context?.['changeConfig'] as boolean | undefined;
      if (etag && changeConfig) {
        return HttpResponse.json<BulkEvaluationResponse>(
          {
            flags: [
              {
                key: 'object-flag',
                value: { complex: true, nested: { also: true }, refreshed: true },
                metadata: TEST_FLAG_METADATA,
              },
              {
                key: 'object-flag-2',
                value: { complex: true, nested: { also: true } },
                metadata: TEST_FLAG_METADATA,
              },
            ],
            metadata: TEST_FLAG_SET_METADATA,
          },
          { headers: { etag: '1234' } },
        );
      }

      if (requestBody.context?.['contextChanged'] as boolean) {
        return HttpResponse.json<BulkEvaluationResponse>(
          {
            flags: [
              {
                key: 'bool-flag',
                value: true,
                metadata: TEST_FLAG_METADATA,
                variant: 'variantA',
                reason: StandardResolutionReasons.STATIC,
              },
              {
                key: 'object-flag',
                value: { complex: true, nested: { also: true }, contextChange: true },
                metadata: TEST_FLAG_METADATA,
              },
            ],
          },
          { headers: { etag: '123' } },
        );
      }

      if (etag) {
        return new HttpResponse(undefined, { status: 304 }) as StrictResponse<undefined>;
      }

      const scopeValue = new URL(info.request.url).searchParams.get('scope');

      return HttpResponse.json<BulkEvaluationResponse>(
        {
          metadata: TEST_FLAG_SET_METADATA,
          flags: scopeValue
            ? [
                {
                  key: 'other-flag',
                  value: true,
                },
              ]
            : [
                {
                  key: 'bool-flag',
                  value: true,
                  metadata: TEST_FLAG_METADATA,
                  variant: 'variantA',
                  reason: StandardResolutionReasons.STATIC,
                },
                {
                  key: 'object-flag',
                  value: { complex: true, nested: { also: true } },
                  metadata: TEST_FLAG_METADATA,
                },
              ],
        },
        { headers: { etag: '123' } },
      );
    },
  ),
];

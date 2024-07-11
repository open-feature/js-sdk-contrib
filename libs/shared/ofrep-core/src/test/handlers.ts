import { http, HttpResponse, StrictResponse } from 'msw';
import {
  BulkEvaluationResponse,
  EvaluationFailureErrorCode,
  EvaluationFailureResponse,
  EvaluationRequest,
  EvaluationResponse,
  EvaluationSuccessReason,
} from '../lib';

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

      if (errors?.['429'] === true) {
        throw HttpResponse.text(undefined, { status: 429, headers: { 'Retry-After': '2000' } });
      }

      if (typeof errors?.['429'] === 'string') {
        throw HttpResponse.text(undefined, { status: 429, headers: { 'Retry-After': errors?.['429'] } });
      }

      if (errors?.['parseError']) {
        return HttpResponse.json<EvaluationFailureResponse>(
          {
            key: info.params.key,
            errorCode: EvaluationFailureErrorCode.ParseError,
          },
          { status: 400 },
        );
      }

      if (errors?.['targetingMissing']) {
        return HttpResponse.json<EvaluationFailureResponse>(
          {
            key: info.params.key,
            errorCode: EvaluationFailureErrorCode.TargetingKeyMissing,
          },
          { status: 400 },
        );
      }

      if (errors?.['invalidContext']) {
        return HttpResponse.json<EvaluationFailureResponse>(
          {
            key: info.params.key,
            errorCode: EvaluationFailureErrorCode.InvalidContext,
          },
          { status: 400 },
        );
      }

      if (errors?.['notFound']) {
        return HttpResponse.json<EvaluationFailureResponse>(
          {
            key: info.params.key,
            errorCode: EvaluationFailureErrorCode.FlagNotFound,
          },
          { status: 404 },
        );
      }

      if (errors?.['general']) {
        return HttpResponse.json<EvaluationFailureResponse>(
          {
            key: info.params.key,
            errorCode: EvaluationFailureErrorCode.General,
          },
          { status: 400 },
        );
      }

      const scopeValue = new URL(info.request.url).searchParams.get('scope');

      return HttpResponse.json<EvaluationResponse>({
        key: info.params.key,
        reason: requestBody.context?.targetingKey
          ? EvaluationSuccessReason.TargetingMatch
          : EvaluationSuccessReason.Static,
        variant: scopeValue ? 'scoped' : 'default',
        value: true,
        metadata: { context: requestBody.context },
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
            errorCode: EvaluationFailureErrorCode.ParseError,
          },
          { status: 400 },
        );
      }

      if (errors?.['targetingMissing']) {
        return HttpResponse.json<EvaluationFailureResponse>(
          {
            key: info.params.key,
            errorCode: EvaluationFailureErrorCode.TargetingKeyMissing,
          },
          { status: 400 },
        );
      }

      if (errors?.['invalidContext']) {
        return HttpResponse.json<EvaluationFailureResponse>(
          {
            key: info.params.key,
            errorCode: EvaluationFailureErrorCode.InvalidContext,
          },
          { status: 400 },
        );
      }

      if (errors?.['notFound']) {
        return HttpResponse.json<EvaluationFailureResponse>(
          {
            key: info.params.key,
            errorCode: EvaluationFailureErrorCode.FlagNotFound,
          },
          { status: 404 },
        );
      }

      if (errors?.['general']) {
        return HttpResponse.json<EvaluationFailureResponse>(
          {
            key: info.params.key,
            errorCode: EvaluationFailureErrorCode.General,
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
                metadata: { context: requestBody.context },
                variant: 'variantA',
                reason: EvaluationSuccessReason.Static,
              },
              {
                key: 'parse-error',
                errorCode: EvaluationFailureErrorCode.ParseError,
                errorDetails: 'custom error details',
              },
              {
                key: 'flag-not-found',
                errorCode: EvaluationFailureErrorCode.FlagNotFound,
                errorDetails: 'custom error details',
              },
              {
                key: 'targeting-key-missing',
                errorCode: EvaluationFailureErrorCode.TargetingKeyMissing,
                errorDetails: 'custom error details',
              },
              {
                key: 'targeting-key-missing',
                errorCode: EvaluationFailureErrorCode.TargetingKeyMissing,
                errorDetails: 'custom error details',
              },
              {
                key: 'invalid-context',
                errorCode: EvaluationFailureErrorCode.InvalidContext,
                errorDetails: 'custom error details',
              },
              {
                key: 'general-error',
                errorCode: EvaluationFailureErrorCode.General,
                errorDetails: 'custom error details',
              },
              {
                key: 'unknown-error',
                errorCode: 'UNKNOWN_ERROR' as EvaluationFailureErrorCode,
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
                metadata: { context: requestBody.context },
              },
              {
                key: 'object-flag-2',
                value: { complex: true, nested: { also: true } },
                metadata: { context: requestBody.context },
              },
            ],
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
                metadata: { context: requestBody.context },
                variant: 'variantA',
                reason: EvaluationSuccessReason.Static,
              },
              {
                key: 'object-flag',
                value: { complex: true, nested: { also: true }, contextChange: true },
                metadata: { context: requestBody.context },
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
                  metadata: { context: requestBody.context },
                  variant: 'variantA',
                  reason: EvaluationSuccessReason.Static,
                },
                {
                  key: 'object-flag',
                  value: { complex: true, nested: { also: true } },
                  metadata: { context: requestBody.context },
                },
              ],
        },
        { headers: { etag: '123' } },
      );
    },
  ),
];

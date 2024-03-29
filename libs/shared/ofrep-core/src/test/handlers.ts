import { http, HttpResponse, StrictResponse } from 'msw';
import {
  BulkEvaluationResponse,
  EvaluationFailureErrorCode,
  EvaluationFailureResponse,
  EvaluationRequest,
  EvaluationResponse,
  EvaluationSuccessReason,
} from '../lib';
import { context } from '@opentelemetry/api';

export const handlers = [
  http.post<{ key: string }, EvaluationRequest, EvaluationResponse>(
    'https://localhost:8080/ofrep/v1/evaluate/flags/:key',
    async (info) => {
      const requestBody = await info.request.json();
      if (!requestBody) {
        throw HttpResponse.text(undefined, { status: 400 });
      }

      const errors = requestBody.context?.['errors'] as Record<string, boolean> | undefined;
      if (errors?.['network']) {
        throw HttpResponse.error();
      }

      if (errors?.['generic400']) {
        throw HttpResponse.text(undefined, { status: 400 });
      }

      if (errors?.['401']) {
        throw HttpResponse.text(undefined, { status: 401 });
      }

      if (errors?.['403']) {
        throw HttpResponse.text(undefined, { status: 403 });
      }

      if (errors?.['429']) {
        throw HttpResponse.text(undefined, { status: 429, headers: { 'Retry-After': '2000' } });
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

      if (errors?.['targetingMissing']) {
        return HttpResponse.json<EvaluationFailureResponse>(
          {
            key: info.params.key,
            errorCode: EvaluationFailureErrorCode.TargetingKeyMissing,
          },
          { status: 400 },
        );
      }

      return HttpResponse.json<EvaluationResponse>({
        key: info.params.key,
        reason: requestBody.context?.targetingKey
          ? EvaluationSuccessReason.TargetingMatch
          : EvaluationSuccessReason.Static,
        variant: 'default',
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

      const errors = requestBody.context?.['errors'] as Record<string, boolean> | undefined;
      if (errors?.['network']) {
        throw HttpResponse.error();
      }

      if (errors?.['generic400']) {
        throw HttpResponse.text(undefined, { status: 400 });
      }

      if (errors?.['401']) {
        throw HttpResponse.text(undefined, { status: 401 });
      }

      if (errors?.['403']) {
        throw HttpResponse.text(undefined, { status: 403 });
      }

      if (errors?.['429']) {
        throw HttpResponse.text(undefined, { status: 429, headers: { 'Retry-After': '1' } });
      }

      if (errors?.['targetingMissing']) {
        return HttpResponse.json<BulkEvaluationResponse>(
          {
            errorCode: EvaluationFailureErrorCode.TargetingKeyMissing,
          },
          { status: 400 },
        );
      }

      if (errors?.['invalidContext']) {
        return HttpResponse.json<BulkEvaluationResponse>(
          {
            errorCode: EvaluationFailureErrorCode.InvalidContext,
          },
          { status: 400 },
        );
      }
      if (errors?.['parseError']) {
        return HttpResponse.json<BulkEvaluationResponse>(
          {
            errorCode: EvaluationFailureErrorCode.ParseError,
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
                key: 'bool-flag',
                value: true,
                metadata: { context: requestBody.context },
                variant: 'variantA',
                reason: EvaluationSuccessReason.Static,
              },
              {
                key: 'object-flag',
                value: { complex: true, nested: { also: true }, refreshed: true },
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

import { OFREPProvider, OFREPProviderOptions } from './ofrep-provider';

// eslint-disable-next-line @nx/enforce-module-boundaries
import { server } from '../../../../shared/ofrep-core/src/test/mock-service-worker';
import {
  OFREPApiTooManyRequestsError,
  OFREPApiUnauthorizedError,
  OFREPApiUnexpectedResponseError,
  OFREPForbiddenError,
} from '@openfeature/ofrep-core';
import {
  FlagNotFoundError,
  GeneralError,
  InvalidContextError,
  ParseError,
  TargetingKeyMissingError,
} from '@openfeature/core';
import { TypeMismatchError } from '@openfeature/server-sdk';

describe('OFREPProvider should', () => {
  let provider: OFREPProvider;

  const defaultOptions: OFREPProviderOptions = {
    baseUrl: 'https://localhost:8080',
  };

  beforeAll(() => {
    server.listen();
    provider = new OFREPProvider(defaultOptions);
  });
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('be and instance of OfrepProvider', () => {
    expect(new OFREPProvider(defaultOptions)).toBeInstanceOf(OFREPProvider);
  });

  it('send auth header from static headers', async () => {
    await expect(provider.resolveBooleanEvaluation('my-flag', false, { expectedAuthHeader: 'secret' })).rejects.toThrow(
      OFREPApiUnauthorizedError,
    );

    const providerWithAuth = new OFREPProvider({ ...defaultOptions, headers: { Authorization: 'secret' } });
    const flag = await providerWithAuth.resolveBooleanEvaluation('my-flag', false, { expectedAuthHeader: 'secret' });
    expect(flag.value).toEqual(true);
  });

  it('throw OFREPApiUnexpectedResponseError on any error code without EvaluationFailureResponse body', async () => {
    await expect(provider.resolveBooleanEvaluation('my-flag', false, { errors: { generic400: true } })).rejects.toThrow(
      OFREPApiUnexpectedResponseError,
    );
  });

  it('throw OFREPApiUnauthorizedError on HTTP 401', async () => {
    await expect(provider.resolveBooleanEvaluation('my-flag', false, { expectedAuthHeader: 'secret' })).rejects.toThrow(
      OFREPApiUnauthorizedError,
    );
  });

  it('throw OFREPForbiddenError on HTTP 403 response', async () => {
    await expect(provider.resolveBooleanEvaluation('my-flag', false, { errors: { 403: true } })).rejects.toThrow(
      OFREPForbiddenError,
    );
  });

  it('throw OFREPForbiddenError on HTTP 429 response', async () => {
    await expect(provider.resolveBooleanEvaluation('my-flag', false, { errors: { 429: true } })).rejects.toThrow(
      OFREPApiTooManyRequestsError,
    );
  });

  it('map EvaluationFailureErrorCode.ParseError from response to ParseError', async () => {
    await expect(provider.resolveBooleanEvaluation('my-flag', false, { errors: { parseError: true } })).rejects.toThrow(
      ParseError,
    );
  });

  it('map EvaluationFailureErrorCode.TargetingKeyMissingError from response to TargetingKeyMissingError', async () => {
    await expect(
      provider.resolveBooleanEvaluation('my-flag', false, { errors: { targetingMissing: true } }),
    ).rejects.toThrow(TargetingKeyMissingError);
  });

  it('map EvaluationFailureErrorCode.InvalidContext from response to InvalidContextError', async () => {
    await expect(
      provider.resolveBooleanEvaluation('my-flag', false, { errors: { invalidContext: true } }),
    ).rejects.toThrow(InvalidContextError);
  });

  it('map EvaluationFailureErrorCode.FlagNotFound from response to FlagNotFoundError', async () => {
    await expect(provider.resolveBooleanEvaluation('my-flag', false, { errors: { notFound: true } })).rejects.toThrow(
      FlagNotFoundError,
    );
  });

  it('map EvaluationFailureErrorCode.General from response to General', async () => {
    await expect(provider.resolveBooleanEvaluation('my-flag', false, { errors: { general: true } })).rejects.toThrow(
      GeneralError,
    );
  });

  it('throw TypeMismatchError if response type is different rom requested one', async () => {
    await expect(provider.resolveNumberEvaluation('my-flag', 42, {})).rejects.toThrow(TypeMismatchError);
  });

  it('send auth header from headerFactory', async () => {
    await expect(provider.resolveBooleanEvaluation('my-flag', false, { expectedAuthHeader: 'secret' })).rejects.toThrow(
      OFREPApiUnauthorizedError,
    );

    const providerWithAuth = new OFREPProvider({
      ...defaultOptions,
      headersFactory: () => [['Authorization', 'secret']],
    });
    const flag = await providerWithAuth.resolveBooleanEvaluation('my-flag', false, { expectedAuthHeader: 'secret' });
    expect(flag.value).toEqual(true);
  });

  it('run successful evaluation of basic boolean flag', async () => {
    const flag = await provider.resolveBooleanEvaluation('my-flag', false, {});
    expect(flag.value).toEqual(true);
  });

  it('run successful evaluation of targeted boolean flag', async () => {
    const flag = await provider.resolveBooleanEvaluation('my-flag', false, {
      targetingKey: 'user1',
      customValue: 'custom',
    });
    expect(flag).toEqual({ flagMetadata: {}, reason: 'TARGETING_MATCH', value: true, variant: 'default' });
  });
});

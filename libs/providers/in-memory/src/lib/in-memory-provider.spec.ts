import { FlagNotFoundError, ResolutionDetails, StandardResolutionReasons } from '@openfeature/js-sdk';
import { InMemoryProvider } from './in-memory-provider';

describe(InMemoryProvider, () => {
  let provider: InMemoryProvider;
  beforeEach(() => {
    const flags = {
      'a-string-flag': 'configured-value',
      'a-boolean-flag': true,
    };
    provider = new InMemoryProvider(flags);
  });

  it('should be and instance of InMemoryProvider', () => {
    expect(provider).toBeInstanceOf(InMemoryProvider);
  });

  describe('boolean flags', () => {
    it('resolves to the configured value for a known flag', async () => {
      const resolution = await provider.resolveBooleanEvaluation('a-boolean-flag');
      verifyResolution(resolution, { expectedValue: true });
    });

    it('throws when asked for an unrecognized flag', async () => {
      const evaluation = provider.resolveBooleanEvaluation('unknown-flag');
      expect(evaluation).rejects.toThrow(FlagNotFoundError);
    });
  });
});

type VerifyResolutionParams<U> = {
  expectedValue: U;
};
function verifyResolution<U>(resolution: ResolutionDetails<U>, { expectedValue }: VerifyResolutionParams<U>) {
  expect(resolution.value).toBe(expectedValue);
  expect(resolution.reason).toBe(StandardResolutionReasons.STATIC);
  expect(resolution.errorCode).toBeUndefined();
}

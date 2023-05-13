import translateResult from "./translate-result";

describe('translateResult', () => {
  it.each([
    true,
    'potato',
    42,
    { yes: 'no' },
  ])('puts the value into the result.', (value) => {
    expect(translateResult<typeof value>({
      value,
      reason: {
        kind: 'OFF',
      },
    }).value).toEqual(value);
  });

  it('converts the variationIndex into a string variant', () => {
    expect(translateResult<boolean>({
      value: true,
      variationIndex: 9,
      reason: {
        kind: 'OFF',
      },
    }).variant).toEqual('9');
  });

  it.each([
    'OFF',
    'FALLTHROUGH',
    'TARGET_MATCH',
    'PREREQUISITE_FAILED',
    'ERROR',
  ])('populates the resolution reason', (reason) => {
    expect(translateResult<boolean>({
      value: true,
      variationIndex: 9,
      reason: {
        kind: reason,
      },
    }).reason).toEqual(reason);
  });

  it('does not populate the errorCode when there is not an error', () => {
    const translated = translateResult<boolean>({
      value: true,
      variationIndex: 9,
      reason: {
        kind: 'OFF',
      },
    });
    expect(translated.errorCode).toBeUndefined();
  });

  it('does populate the errorCode when there is an error', () => {
    const translated = translateResult<boolean>({
      value: true,
      variationIndex: 9,
      reason: {
        kind: 'ERROR',
        errorKind: 'BAD_APPLE',
      },
    });
    expect(translated.errorCode).toEqual('GENERAL');
  });
});

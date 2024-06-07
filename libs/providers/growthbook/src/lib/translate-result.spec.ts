import { TypeMismatchError } from '@openfeature/core';
import translateResult from './translate-result';

describe('translateResult', () => {
  it('does populate the errorCode correctly when there is an error', () => {
    const translated = translateResult<boolean>(
      {
        value: true,
        source: 'unknownFeature',
        on: true,
        off: false,
        ruleId: 'test',
        experimentResult: {
          value: true,
          variationId: 1,
          key: 'treatment',
          inExperiment: true,
          hashAttribute: 'id',
          hashValue: 'abc',
          featureId: 'testFlagKey',
        },
      },
      false,
    );
    expect(translated.errorCode).toEqual('FLAG_NOT_FOUND');
  });

  it('does not populate the errorCode when there is not an error', () => {
    const translated = translateResult<boolean>(
      {
        value: true,
        source: 'defaultValue',
        on: true,
        off: false,
        ruleId: 'test',
        experimentResult: {
          value: true,
          variationId: 1,
          key: 'treatment',
          inExperiment: true,
          hashAttribute: 'id',
          hashValue: 'abc',
          featureId: 'testFlagKey',
        },
      },
      false,
    );
    expect(translated.errorCode).toBeUndefined();
  });

  it('throws an error when result type differs from defaultValue type', () => {
    expect(() =>
      translateResult<boolean>(
        {
          value: 'test',
          source: 'defaultValue',
          on: true,
          off: false,
          ruleId: 'test',
          experimentResult: {
            value: 'test',
            variationId: 1,
            key: 'treatment',
            inExperiment: true,
            hashAttribute: 'id',
            hashValue: 'abc',
            featureId: 'testFlagKey',
          },
        },
        false,
      ),
    ).toThrow(TypeMismatchError);
  });
});

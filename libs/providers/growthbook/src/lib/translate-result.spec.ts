import { TypeMismatchError } from '@openfeature/core';
import type { FeatureResultSource } from '@growthbook/growthbook';
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
  it.each<[FeatureResultSource, string]>([
    ['experiment', 'SPLIT'],
    ['force', 'TARGETING_MATCH'],
    ['override', 'STATIC'],
    ['prerequisite', 'DEFAULT'],
    ['defaultValue', 'DEFAULT'],
    ['unknownFeature', 'ERROR'],
    ['cyclicPrerequisite', 'ERROR'],
  ])('maps the GrowthBook source %s to the standard reason %s', (source, expected) => {
    const translated = translateResult<boolean>({ value: true, source, on: true, off: false, ruleId: 'test' }, false);
    expect(translated.reason).toEqual(expected);
  });

  it('falls back to UNKNOWN for a source it does not recognise', () => {
    const translated = translateResult<boolean>(
      { value: true, source: 'somethingNew' as FeatureResultSource, on: true, off: false, ruleId: 'test' },
      false,
    );
    expect(translated.reason).toEqual('UNKNOWN');
  });

  it('preserves the raw GrowthBook source in flag metadata', () => {
    const translated = translateResult<boolean>(
      { value: true, source: 'experiment', on: true, off: false, ruleId: 'test' },
      false,
    );
    expect(translated.flagMetadata).toEqual({ source: 'experiment' });
  });
});

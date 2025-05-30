import type { EvaluationContext } from '@openfeature/server-sdk';
import type { GOFFEvaluationContext } from './model';
import { transformContext } from './context-transformer';

describe('contextTransformer', () => {
  it('should use the targetingKey as user key', () => {
    const got = transformContext({
      targetingKey: 'user-key',
    } as EvaluationContext);
    const want: GOFFEvaluationContext = {
      key: 'user-key',
      custom: {},
    };
    expect(got).toEqual(want);
  });

  it('should specify the anonymous field base on attributes', () => {
    const got = transformContext({
      targetingKey: 'user-key',
      anonymous: true,
    } as EvaluationContext);
    const want: GOFFEvaluationContext = {
      key: 'user-key',
      custom: { anonymous: true },
    };
    expect(got).toEqual(want);
  });

  it('should hash the context as key if no targetingKey provided', () => {
    const got = transformContext({
      anonymous: true,
      firstname: 'John',
      lastname: 'Doe',
      email: 'john.doe@gofeatureflag.org',
    } as EvaluationContext);

    const want: GOFFEvaluationContext = {
      key: 'dd3027562879ff6857cc6b8b88ced570546d7c0c',
      custom: {
        anonymous: true,
        firstname: 'John',
        lastname: 'Doe',
        email: 'john.doe@gofeatureflag.org',
      },
    };
    expect(got).toEqual(want);
  });
  it('should fill custom fields if extra field are present', () => {
    const got = transformContext({
      targetingKey: 'user-key',
      anonymous: true,
      firstname: 'John',
      lastname: 'Doe',
      email: 'john.doe@gofeatureflag.org',
    } as EvaluationContext);

    const want: GOFFEvaluationContext = {
      key: 'user-key',
      custom: {
        firstname: 'John',
        lastname: 'Doe',
        email: 'john.doe@gofeatureflag.org',
        anonymous: true,
      },
    };
    expect(got).toEqual(want);
  });
});

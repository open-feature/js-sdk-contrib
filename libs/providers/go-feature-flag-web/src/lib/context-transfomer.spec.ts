import {GoFeatureFlagEvaluationContext} from './model';
import {transformContext} from './context-transformer';
import {TargetingKeyMissingError, EvaluationContext} from "@openfeature/web-sdk";

describe('contextTransformer', () => {
  it('should use the targetingKey as user key', () => {
    const got = transformContext({
      targetingKey: 'user-key',
    } as EvaluationContext);
    const want: GoFeatureFlagEvaluationContext = {
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
    const want: GoFeatureFlagEvaluationContext = {
      key: 'user-key',
      custom: {
        anonymous: true,
      },
    };
    expect(got).toEqual(want);
  });

  it('should hash the context as key if no targetingKey provided', () => {
    expect(() => {
      transformContext({
        anonymous: true,
        firstname: 'John',
        lastname: 'Doe',
        email: 'john.doe@gofeatureflag.org',
      } as EvaluationContext);
    }).toThrow(TargetingKeyMissingError);
  });

  it('should fill custom fields if extra field are present', () => {
    const got = transformContext({
      targetingKey: 'user-key',
      anonymous: true,
      firstname: 'John',
      lastname: 'Doe',
      email: 'john.doe@gofeatureflag.org',
    } as EvaluationContext);

    const want: GoFeatureFlagEvaluationContext = {
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

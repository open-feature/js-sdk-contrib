import {FeatureFlag, Flag} from './feature-flag';

describe('Flagd flag structure', () => {
  it('should be constructed with valid input - boolean', () => {
    const input: Flag = {
      state: 'ENABLED',
      defaultVariant: 'off',
      variants: {
        on: true,
        off: false,
      },
      targeting: '',
    };

    const ff = new FeatureFlag(input);

    expect(ff).toBeTruthy();
    expect(ff.state).toBe('ENABLED');
    expect(ff.defaultVariant).toBe('off');
    expect(ff.targetingString).toBe('""');
    expect(ff.variants.get('on')).toBeTruthy();
    expect(ff.variants.get('off')).toBeFalsy();
  });

  it('should be constructed with valid input - number', () => {
    const input = {
      state: 'ENABLED',
      defaultVariant: 'one',
      variants: {
        one: 1.0,
        two: 2.0,
      },
      targeting: '',
    };

    const ff = new FeatureFlag(input);

    expect(ff).toBeTruthy();
    expect(ff.state).toBe('ENABLED');
    expect(ff.defaultVariant).toBe('one');
    expect(ff.targetingString).toBe('""');
    expect(ff.variants.get('one')).toBe(1.0);
    expect(ff.variants.get('two')).toBe(2.0);
  });

  it('should be constructed with valid input - object', () => {
    const input = {
      state: 'ENABLED',
      defaultVariant: 'pi2',
      variants: {
        pi2: {
          value: 3.14,
          accuracy: 2,
        },
        pi5: {
          value: 3.14159,
          accuracy: 5,
        },
      },
      targeting: '',
    };

    const ff = new FeatureFlag(input);

    expect(ff).toBeTruthy();
    expect(ff.state).toBe('ENABLED');
    expect(ff.defaultVariant).toBe('pi2');
    expect(ff.targetingString).toBe('""');
    expect(ff.variants.get('pi2')).toStrictEqual({ value: 3.14, accuracy: 2 });
    expect(ff.variants.get('pi5')).toStrictEqual({ value: 3.14159, accuracy: 5 });
  });
});

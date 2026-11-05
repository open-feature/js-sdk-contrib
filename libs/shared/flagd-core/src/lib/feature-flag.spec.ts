import type { Logger } from '@openfeature/core';
import type { Flag } from './feature-flag';
import { FeatureFlag } from './feature-flag';

const logger: Logger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

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

    const ff = new FeatureFlag('test', input, logger);

    expect(ff).toBeTruthy();
    expect(ff.state).toBe('ENABLED');
    expect(ff.defaultVariant).toBe('off');
    expect(ff.variants.get('on')).toBeTruthy();
    expect(ff.variants.get('off')).toBeFalsy();
  });

  it('should be constructed with valid input - string', () => {
    const input: Flag = {
      state: 'ENABLED',
      defaultVariant: 'off',
      variants: {
        on: 'on',
        off: 'off',
      },
      targeting: '',
    };

    const ff = new FeatureFlag('test', input, logger);

    expect(ff).toBeTruthy();
    expect(ff.state).toBe('ENABLED');
    expect(ff.defaultVariant).toBe('off');
    expect(ff.variants.get('on')).toBe('on');
    expect(ff.variants.get('off')).toBe('off');
  });

  it('should be constructed with valid input - number', () => {
    const input: Flag = {
      state: 'ENABLED',
      defaultVariant: 'one',
      variants: {
        one: 1.0,
        two: 2.0,
      },
      targeting: '',
    };

    const ff = new FeatureFlag('test', input, logger);

    expect(ff).toBeTruthy();
    expect(ff.state).toBe('ENABLED');
    expect(ff.defaultVariant).toBe('one');
    expect(ff.variants.get('one')).toBe(1.0);
    expect(ff.variants.get('two')).toBe(2.0);
  });

  it('should be constructed with valid input - object', () => {
    const input: Flag = {
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

    const ff = new FeatureFlag('test', input, logger);

    expect(ff).toBeTruthy();
    expect(ff.state).toBe('ENABLED');
    expect(ff.defaultVariant).toBe('pi2');
    expect(ff.variants.get('pi2')).toStrictEqual({ value: 3.14, accuracy: 2 });
    expect(ff.variants.get('pi5')).toStrictEqual({ value: 3.14159, accuracy: 5 });
  });
});

describe('Flagd flag hash', () => {
  const flag = (defaultVariant: string): Flag => ({
    state: 'ENABLED',
    defaultVariant,
    variants: { on: true, off: false },
  });

  it('should be equal for equal flags', () => {
    expect(new FeatureFlag('a', flag('on'), logger).hash).toBe(new FeatureFlag('a', flag('on'), logger).hash);
  });

  it('should differ for different flags', () => {
    expect(new FeatureFlag('a', flag('on'), logger).hash).not.toBe(new FeatureFlag('a', flag('off'), logger).hash);
  });

  it('should be the same on every read', () => {
    const ff = new FeatureFlag('a', flag('on'), logger);
    expect(ff.hash).toBe(ff.hash);
  });
});

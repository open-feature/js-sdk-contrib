import type { Logger } from '@openfeature/core';
import { Targeting } from './targeting';

const logger: Logger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

const requestLogger: Logger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

describe('targeting', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('Context injection', () => {
    it('should inject flag key as a property', () => {
      const flagKey = 'flagA';
      const logic = { '===': [{ var: '$flagd.flagKey' }, flagKey] };
      const targeting = new Targeting(logic, logger);

      expect(targeting.evaluate(flagKey, {})).toBeTruthy();
    });

    it('should inject current timestamp as a property', () => {
      const ts = Math.floor(Date.now() / 1000);
      const logic = { '>=': [{ var: '$flagd.timestamp' }, ts] };
      const targeting = new Targeting(logic, logger);

      expect(targeting.evaluate('flag', {})).toBeTruthy();
    });

    it('should override injected properties if already present in context', () => {
      const flagKey = 'flagA';
      const logic = { '===': [{ var: '$flagd.flagKey' }, flagKey] };
      const ctx = {
        $flagd: {
          flagKey: 'someOtherFlag',
        },
      };

      const targeting = new Targeting(logic, logger);

      expect(targeting.evaluate(flagKey, ctx)).toBeTruthy();
    });

    it('should reject unknown methods nested inside arrays in interpreter mode', () => {
      const logic = { in: [1, [{ bogus: [1] }]] };

      expect(() => new Targeting(logic, logger, { disableDynamicCodeGeneration: true })).toThrow(
        "Method 'bogus' was not found in the Logic Engine.",
      );
    });
  });

  describe('String comparison operator', () => {
    it('should evaluate starts with calls', () => {
      const logic = { starts_with: [{ var: 'email' }, 'admin'] };
      const targeting = new Targeting(logic, logger);
      expect(targeting.evaluate('flag', { email: 'admin@abc.com' })).toBeTruthy();
    });

    it('should evaluate ends with calls', () => {
      const logic = { ends_with: [{ var: 'email' }, 'abc.com'] };
      const targeting = new Targeting(logic, logger);
      expect(targeting.evaluate('flag', { email: 'admin@abc.com' })).toBeTruthy();
    });

    it('should be falsy if the input is not an array', () => {
      const logic = { starts_with: 'invalid' };
      const targeting = new Targeting(logic, logger);
      expect(targeting.evaluate('flag', { email: 'admin@abc.com' })).toBeFalsy();
      expect(logger.debug).toHaveBeenCalled();
    });

    it('should be falsy if the input array is too large', () => {
      const logic = { starts_with: [{ var: 'email' }, 'abc.com', 'invalid'] };
      const targeting = new Targeting(logic, logger);
      expect(targeting.evaluate('flag', { email: 'admin@abc.com' })).toBeFalsy();
      expect(logger.debug).toHaveBeenCalled();
    });

    it('should be falsy if the input array contains a non-string', () => {
      const logic = { starts_with: [{ var: 'email' }, 2] };
      const targeting = new Targeting(logic, logger);
      expect(targeting.evaluate('flag', { email: 'admin@abc.com' })).toBeFalsy();
      expect(logger.debug).toHaveBeenCalled();
    });
  });

  describe('Sem ver operator', () => {
    it('should support equal operator', () => {
      const logic = { sem_ver: ['v1.2.3', '=', '1.2.3'] };
      const targeting = new Targeting(logic, logger);
      expect(targeting.evaluate('flag', {})).toBeTruthy();
    });

    it('should support neq operator', () => {
      const logic = { sem_ver: ['v1.2.3', '!=', '1.2.4'] };
      const targeting = new Targeting(logic, logger);
      expect(targeting.evaluate('flag', {})).toBeTruthy();
    });

    it('should support lt operator', () => {
      const logic = { sem_ver: ['v1.2.3', '<', '1.2.4'] };
      const targeting = new Targeting(logic, logger);
      expect(targeting.evaluate('flag', {})).toBeTruthy();
    });

    it('should support lte operator', () => {
      const logic = { sem_ver: ['v1.2.3', '<=', '1.2.3'] };
      const targeting = new Targeting(logic, logger);
      expect(targeting.evaluate('flag', {})).toBeTruthy();
    });

    it('should support gte operator', () => {
      const logic = { sem_ver: ['v1.2.3', '>=', '1.2.3'] };
      const targeting = new Targeting(logic, logger);
      expect(targeting.evaluate('flag', {})).toBeTruthy();
    });

    it('should support gt operator', () => {
      const logic = { sem_ver: ['v1.2.4', '>', '1.2.3'] };
      const targeting = new Targeting(logic, logger);
      expect(targeting.evaluate('flag', {})).toBeTruthy();
    });

    it('should support major comparison operator', () => {
      const logic = { sem_ver: ['v1.2.3', '^', 'v1.0.0'] };
      const targeting = new Targeting(logic, logger);
      expect(targeting.evaluate('flag', {})).toBeTruthy();
    });

    it('should support minor comparison operator', () => {
      const logic = { sem_ver: ['v5.0.3', '~', 'v5.0.8'] };
      const targeting = new Targeting(logic, logger);
      expect(targeting.evaluate('flag', {})).toBeTruthy();
    });

    it('should handle unknown operator', () => {
      const logic = { sem_ver: ['v1.0.0', '-', 'v1.0.0'] };
      const targeting = new Targeting(logic, logger);
      expect(targeting.evaluate('flag', {})).toBeFalsy();
    });

    it('should handle invalid inputs', () => {
      const logic = { sem_ver: ['myVersion_1', '=', 'myVersion_1'] };
      const targeting = new Targeting(logic, logger);
      expect(targeting.evaluate('flag', {})).toBeFalsy();
    });

    it('should validate inputs', () => {
      const logic = { sem_ver: ['myVersion_2', '+', 'myVersion_1', 'myVersion_1'] };
      const targeting = new Targeting(logic, logger);
      expect(targeting.evaluate('flag', {})).toBeFalsy();
    });
  });

  describe('Fractional operator', () => {
    it('should evaluate to red with key "bucketKeyA"', () => {
      const logic = {
        fractional: [{ cat: [{ var: '$flagd.flagKey' }, { var: 'key' }] }, ['red', 50], ['blue', 50]],
      };
      const targeting = new Targeting(logic, logger);

      expect(targeting.evaluate('flagA', { key: 'bucketKeyA' })).toBe('red');
    });

    it('should evaluate to blue with key "bucketKey4"', () => {
      const logic = {
        fractional: [{ cat: [{ var: '$flagd.flagKey' }, { var: 'key' }] }, ['red', 50], ['blue', 50]],
      };
      const targeting = new Targeting(logic, logger);

      expect(targeting.evaluate('flagA', { key: 'bucketKey4' })).toBe('blue');
    });

    it('should evaluate valid rule with targeting key', () => {
      const logic = {
        fractional: [
          ['red', 50],
          ['blue', 50],
        ],
      };
      const targeting = new Targeting(logic, logger);

      expect(targeting.evaluate('flagA', { targetingKey: 'bucketKeyB' })).toBe('red');
    });

    it('should evaluate valid rule with targeting key although one does not have a fraction', () => {
      const logic = {
        fractional: [['red', 1], ['blue']],
      };
      const targeting = new Targeting(logic, logger);

      expect(targeting.evaluate('flagA', { targetingKey: 'bucketKeyB' })).toBe('red');
    });

    it('should return null if targeting key is missing', () => {
      const logic = {
        fractional: [
          ['red', 1],
          ['blue', 1],
        ],
      };
      const targeting = new Targeting(logic, logger);

      expect(targeting.evaluate('flagA', {})).toBe(null);
    });

    it('should support bucket sum with sum bigger than 100', () => {
      const logic = {
        fractional: [
          ['red', 55],
          ['blue', 55],
        ],
      };
      const targeting = new Targeting(logic, logger);

      expect(targeting.evaluate('flagA', { targetingKey: 'key' })).toBe('blue');
    });

    it('should support bucket sum with sum lower than 100', () => {
      const logic = {
        fractional: [
          ['red', 45],
          ['blue', 45],
        ],
      };
      const targeting = new Targeting(logic, logger);

      expect(targeting.evaluate('flagA', { targetingKey: 'key' })).toBe('blue');
    });

    it('should support number variant names', () => {
      const logic = {
        fractional: [{ cat: [{ var: '$flagd.flagKey' }, { var: 'key' }] }, ['red', 50], [100, 50]],
      };
      const targeting = new Targeting(logic, logger);

      expect(targeting.evaluate('flagA', { key: 'bucketKeyA' })).toBe('red');
      expect(targeting.evaluate('flagA', { key: 'bucketKey4' })).toBe(100);
    });

    it('should support boolean variant names', () => {
      const logic = {
        fractional: [{ cat: [{ var: '$flagd.flagKey' }, { var: 'key' }] }, [true, 50], [false, 50]],
      };
      const targeting = new Targeting(logic, logger);

      expect(targeting.evaluate('flagA', { key: 'bucketKeyA' })).toBe(true);
      expect(targeting.evaluate('flagA', { key: 'bucketKey4' })).toBe(false);
    });

    it('should return null when variant expression evaluates to a non-scalar (object/array)', () => {
      const logic = {
        fractional: [{ var: 'targetingKey' }, [{ var: 'missingKey' }, 50], ['blue', 50]],
      };
      const targeting = new Targeting(logic, logger);

      expect(targeting.evaluate('flag', { targetingKey: 'jon@company.com' })).toBe(null);
    });

    it('should not support invalid bucket configurations', () => {
      const logic = {
        fractional: [
          ['red', 45, 1256],
          ['blue', 4, 455],
        ],
      };
      const targeting = new Targeting(logic, logger);

      expect(targeting.evaluate('flagA', { targetingKey: 'key' })).toBe(null);
      expect(logger.debug).toHaveBeenCalled();
    });

    it('should not support float (non-integer) weights', () => {
      const logic = {
        fractional: [
          ['red', 0.5],
          ['blue', 99.5],
        ],
      };
      const targeting = new Targeting(logic, logger);

      expect(targeting.evaluate('flagA', { targetingKey: 'key' })).toBe(null);
      expect(logger.debug).toHaveBeenCalled();
    });

    it('should return null when total weight exceeds Math.MaxInt32 (2147483647)', () => {
      const logic = {
        fractional: [
          ['red', 2000000000],
          ['blue', 200000000], // total = 2200000000 > 2147483647
        ],
      };
      const targeting = new Targeting(logic, logger);

      expect(targeting.evaluate('flagA', { targetingKey: 'key' })).toBe(null);
      expect(logger.debug).toHaveBeenCalled();
    });

    it('should support total weight exactly equal to Math.MaxInt32 (2147483647)', () => {
      const logic = {
        fractional: [
          ['a', 2147483646],
          ['b', 1], // total = 2147483647 = MaxInt32, valid
        ],
      };
      const targeting = new Targeting(logic, logger);

      // bucketBy = 'flagA' + 'testKey' = 'flagAtestKey' -> 'a' (nearly all weight on 'a')
      const result = targeting.evaluate('flagA', { targetingKey: 'testKey' });
      expect(result).toBe('a');
    });

    it('should support sub-percent granularity with large integer weights (0.1% red)', () => {
      const logic = {
        fractional: ['user2077', ['red', 10], ['blue', 9990]],
      };
      const targeting = new Targeting(logic, logger);
      expect(targeting.evaluate('flagA', {})).toBe('red');

      const logicControl = {
        fractional: ['user0', ['red', 10], ['blue', 9990]],
      };
      const targetingControl = new Targeting(logicControl, logger);
      expect(targetingControl.evaluate('flagA', {})).toBe('blue');
    });

    it('should support a nested "if" expression as a variant name', () => {
      const logic = {
        fractional: [
          { var: 'targetingKey' },
          [{ if: [{ '==': [{ var: 'tier' }, 'premium'] }, 'premium', 'standard'] }, 50],
          ['standard', 50],
        ],
      };
      const targeting = new Targeting(logic, logger);

      expect(targeting.evaluate('flag', { targetingKey: 'jon@company.com', tier: 'premium' })).toBe('premium');
      expect(targeting.evaluate('flag', { targetingKey: 'jon@company.com', tier: 'basic' })).toBe('standard');
      // user1 → bv(100)=76 → bucket1 → always "standard"
      expect(targeting.evaluate('flag', { targetingKey: 'user1', tier: 'premium' })).toBe('standard');
    });

    it('should support a nested "var" expression as a variant name', () => {
      const logic = {
        fractional: [{ var: 'targetingKey' }, [{ var: 'color' }, 50], ['blue', 50]],
      };
      const targeting = new Targeting(logic, logger);

      expect(targeting.evaluate('flag', { targetingKey: 'jon@company.com', color: 'red' })).toBe('red');
      expect(targeting.evaluate('flag', { targetingKey: 'jon@company.com', color: 'green' })).toBe('green');
      // user1 → bv(100)=76 → bucket1 → always "blue"
      expect(targeting.evaluate('flag', { targetingKey: 'user1', color: 'red' })).toBe('blue');
    });

    it('should return null when a nested variant expression evaluates to a non-string', () => {
      const logic = {
        fractional: [{ var: 'targetingKey' }, [{ var: 'color' }, 50], ['blue', 50]],
      };
      const targeting = new Targeting(logic, logger);

      expect(targeting.evaluate('flag', { targetingKey: 'jon@company.com' })).toBe(null);
    });

    it('should support a computed weight via a "var" expression', () => {
      const logic = {
        fractional: [
          ['new-feature', { var: 'rolloutPercent' }],
          ['control', { '-': [100, { var: 'rolloutPercent' }] }],
        ],
      };
      const targeting = new Targeting(logic, logger);

      expect(targeting.evaluate('flagA', { targetingKey: 'bucketKeyA', rolloutPercent: 10 })).toBe('new-feature');
      expect(targeting.evaluate('flagA', { targetingKey: 'bucketKeyB', rolloutPercent: 10 })).toBe('control');
      expect(targeting.evaluate('flagA', { targetingKey: 'bucketKeyB', rolloutPercent: 90 })).toBe('new-feature');
    });

    it('should support weight=0 (variant effectively excluded from traffic)', () => {
      const logic = {
        fractional: [
          { var: 'targetingKey' },
          ['red', { if: [{ '==': [{ var: 'tier' }, 'premium'] }, 100, 0] }],
          ['blue', 10],
        ],
      };
      const targeting = new Targeting(logic, logger);

      expect(targeting.evaluate('flag', { targetingKey: 'jon@company.com', tier: 'premium' })).toBe('red');
      expect(targeting.evaluate('flag', { targetingKey: 'jon@company.com', tier: 'basic' })).toBe('blue');
      expect(targeting.evaluate('flag', { targetingKey: 'user1', tier: 'premium' })).toBe('red');
      expect(targeting.evaluate('flag', { targetingKey: 'user1', tier: 'basic' })).toBe('blue');
    });

    it('should log using a custom logger', () => {
      const logic = {
        fractional: [
          ['red', 45, 1256],
          ['blue', 4, 455],
        ],
      };
      const targeting = new Targeting(logic, logger);

      expect(targeting.evaluate('flagA', { targetingKey: 'key' }, requestLogger)).toBe(null);
      expect(logger.debug).not.toHaveBeenCalled();
      expect(requestLogger.debug).toHaveBeenCalled();
    });

    it('should support a single-bucket list (100% traffic to one variant)', () => {
      const logic = {
        fractional: [['single-entry', 1]],
      };
      const targeting = new Targeting(logic, logger);

      expect(targeting.evaluate('flagA', { targetingKey: 'anyKey' })).toBe('single-entry');
    });

    it('should support mixed variant types and a nested fractional as a variant', () => {
      const logic = {
        fractional: [
          { var: 'targetingKey' },
          ['clubs', 1],
          [true, 1],
          [1, 1],
          [
            {
              fractional: [
                ['clubs', 25],
                ['diamonds', 25],
                ['hearts', 25],
                ['spades', 25],
              ],
            },
            1,
          ],
        ],
      };
      const targeting = new Targeting(logic, logger);
      const result = targeting.evaluate<string | number | boolean>('flagA', {
        targetingKey: 'user1',
        targetingKey2: 'user2',
      });
      // user1 lands in one of the four buckets — all are valid
      expect(['clubs', true, 1, 'diamonds', 'hearts', 'spades']).toContain(result);
    });

    it('should support a timestamp-based weight with an explicit bucket key', () => {
      const ts = Math.floor(Date.now() / 1000);
      const w1 = ts - 1740000000; // large positive, grows over time
      const logic = {
        fractional: [
          { cat: [{ var: '$flagd.flagKey' }, { var: 'email' }] },
          ['on', { '-': [{ var: '$flagd.timestamp' }, 1740000000] }],
          ['off', 100],
        ],
      };
      const targeting = new Targeting(logic, logger);
      const result = targeting.evaluate('flag', { email: 'user@example.com' });

      // 'on' has overwhelmingly more weight than 'off' — nearly all users get 'on'
      // We just assert a valid variant is returned; the exact result depends on the hash.
      expect(['on', 'off']).toContain(result);
      // Sanity-check that the computed weight is positive and within bounds
      expect(w1).toBeGreaterThan(0);
      expect(w1 + 100).toBeLessThan(2147483647);
    });

    it('should support two timestamp-derived weights summing to a fixed total', () => {
      // w1 = ts - 1740000000 (ramp up),  w2 = 1800000000 - ts (ramp down)
      // Their sum is always 60000000 regardless of current time.
      // When ts > 1800000000 w2 goes negative and is clamped to 0 → 'off' gets no traffic.
      const logic = {
        fractional: [
          ['on', { '-': [{ var: '$flagd.timestamp' }, 1740000000] }],
          ['off', { '-': [1800000000, { var: '$flagd.timestamp' }] }],
        ],
      };
      const targeting = new Targeting(logic, logger);
      const result = targeting.evaluate('flagA', { targetingKey: 'user1' });

      expect(['on', 'off']).toContain(result);
    });

    it('should clamp negative computed weights to 0 without error', () => {
      const logic = {
        fractional: [
          'anyUser',
          ['on', -50], // negative: clamped to 0
          ['off', 100],
        ],
      };
      const targeting = new Targeting(logic, logger);

      expect(targeting.evaluate('flag', {})).toBe('off');
    });
  });
});

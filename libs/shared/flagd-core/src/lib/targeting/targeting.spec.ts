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

    it('should evaluate to blue with key "bucketKeyB"', () => {
      const logic = {
        fractional: [{ cat: [{ var: '$flagd.flagKey' }, { var: 'key' }] }, ['red', 50], ['blue', 50]],
      };
      const targeting = new Targeting(logic, logger);

      expect(targeting.evaluate('flagA', { key: 'bucketKeyB' })).toBe('blue');
    });

    it('should evaluate valid rule with targeting key', () => {
      const logic = {
        fractional: [
          ['red', 50],
          ['blue', 50],
        ],
      };
      const targeting = new Targeting(logic, logger);

      expect(targeting.evaluate('flagA', { targetingKey: 'bucketKeyB' })).toBe('blue');
    });

    it('should evaluate valid rule with targeting key although one does not have a fraction', () => {
      const logic = {
        fractional: [['red', 1], ['blue']],
      };
      const targeting = new Targeting(logic, logger);

      expect(targeting.evaluate('flagA', { targetingKey: 'bucketKeyB' })).toBe('blue');
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

    it('should not support non-string variant names', () => {
      const logic = {
        fractional: [
          ['red', 50],
          [100, 50],
        ],
      };
      const targeting = new Targeting(logic, logger);

      expect(targeting.evaluate('flagA', { targetingKey: 'key' })).toBe(null);
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
  });
});

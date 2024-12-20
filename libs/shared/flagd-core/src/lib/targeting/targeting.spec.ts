import type { Logger } from '@openfeature/core';
import { Targeting } from './targeting';

const logger: Logger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
};

describe('Targeting rule evaluator', () => {
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
});

describe('String comparison operator should validate', () => {
  it('missing input', () => {
    const logic = { starts_with: [{ var: 'email' }] };
    const targeting = new Targeting(logic, logger);
    expect(targeting.evaluate('flag', { email: 'admin@abc.com' })).toBeFalsy();
  });

  it('non string variable', () => {
    const logic = { starts_with: [{ var: 'someNumber' }, 'abc.com'] };
    const targeting = new Targeting(logic, logger);
    expect(targeting.evaluate('flag', { someNumber: 123456 })).toBeFalsy();
  });

  it('non string comparator', () => {
    const logic = { starts_with: [{ var: 'email' }, 123456] };
    const targeting = new Targeting(logic, logger);
    expect(targeting.evaluate('flag', { email: 'admin@abc.com' })).toBeFalsy();
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

describe('fractional operator', () => {
  it('should evaluate valid rule', () => {
    const logic = {
      fractional: [{ cat: [{ var: '$flagd.flagKey' }, { var: 'key' }] }, ['red', 50], ['blue', 50]],
    };
    const targeting = new Targeting(logic, logger);

    expect(targeting.evaluate('flagA', { key: 'bucketKeyA' })).toBe('red');
  });

  it('should evaluate valid rule', () => {
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
});

describe('fractional operator should validate', () => {
  it('bucket sum with sum bigger than 100', () => {
    const logic = {
      fractional: [
        ['red', 55],
        ['blue', 55],
      ],
    };
    const targeting = new Targeting(logic, logger);

    expect(targeting.evaluate('flagA', { targetingKey: 'key' })).toBe('blue');
  });

  it('bucket sum with sum lower than 100', () => {
    const logic = {
      fractional: [
        ['red', 45],
        ['blue', 45],
      ],
    };
    const targeting = new Targeting(logic, logger);

    expect(targeting.evaluate('flagA', { targetingKey: 'key' })).toBe('blue');
  });

  it('buckets properties to have variant and fraction', () => {
    const logic = {
      fractional: [
        ['red', 50],
        [100, 50],
      ],
    };
    const targeting = new Targeting(logic, logger);

    expect(targeting.evaluate('flagA', { targetingKey: 'key' })).toBe(null);
  });

  it('buckets properties to have variant and fraction', () => {
    const logic = {
      fractional: [
        ['red', 45, 1256],
        ['blue', 4, 455],
      ],
    };
    const targeting = new Targeting(logic, logger);

    expect(targeting.evaluate('flagA', { targetingKey: 'key' })).toBe(null);
  });
});

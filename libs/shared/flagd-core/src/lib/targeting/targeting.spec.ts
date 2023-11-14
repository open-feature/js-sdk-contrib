import { Targeting } from './targeting';

describe('Targeting rule evaluator', () => {
  let targeting: Targeting;

  beforeAll(() => {
    targeting = new Targeting();
  });

  it('should inject flag key as a property', () => {
    const flagKey = 'flagA';
    const input = { '===': [{ var: '$flagd.flagKey' }, flagKey] };

    expect(targeting.applyTargeting(flagKey, input, {})).toBeTruthy();
  });

  it('should inject current timestamp as a property', () => {
    const ts = Math.floor(Date.now() / 1000);
    const input = { '>=': [{ var: '$flagd.timestamp' }, ts] };

    expect(targeting.applyTargeting('flag', input, {})).toBeTruthy();
  });

  it('should override injected properties if already present in context', () => {
    const flagKey = 'flagA';
    const input = { '===': [{ var: '$flagd.flagKey' }, flagKey] };
    const ctx = {
      $flagd: {
        flagKey: 'someOtherFlag',
      },
    };

    expect(targeting.applyTargeting(flagKey, input, ctx)).toBeTruthy();
  });
});

describe('String comparison operator', () => {
  let targeting: Targeting;

  beforeAll(() => {
    targeting = new Targeting();
  });

  it('should evaluate starts with calls', () => {
    const input = { starts_with: [{ var: 'email' }, 'admin'] };
    expect(targeting.applyTargeting('flag', input, { email: 'admin@abc.com' })).toBeTruthy();
  });

  it('should evaluate ends with calls', () => {
    const input = { ends_with: [{ var: 'email' }, 'abc.com'] };
    expect(targeting.applyTargeting('flag', input, { email: 'admin@abc.com' })).toBeTruthy();
  });
});

describe('String comparison operator should validate', () => {
  let targeting: Targeting;

  beforeAll(() => {
    targeting = new Targeting();
  });

  it('missing input', () => {
    const input = { starts_with: [{ var: 'email' }] };
    expect(targeting.applyTargeting('flag', input, { email: 'admin@abc.com' })).toBeFalsy();
  });

  it('non string variable', () => {
    const input = { starts_with: [{ var: 'someNumber' }, 'abc.com'] };
    expect(targeting.applyTargeting('flag', input, { someNumber: 123456 })).toBeFalsy();
  });

  it('non string comparator', () => {
    const input = { starts_with: [{ var: 'email' }, 123456] };
    expect(targeting.applyTargeting('flag', input, { email: 'admin@abc.com' })).toBeFalsy();
  });
});

describe('Sem ver operator', () => {
  let targeting: Targeting;

  beforeAll(() => {
    targeting = new Targeting();
  });

  it('should support equal operator', () => {
    const input = { sem_ver: ['v1.2.3', '=', '1.2.3'] };
    expect(targeting.applyTargeting('flag', input, {})).toBeTruthy();
  });

  it('should support neq operator', () => {
    const input = { sem_ver: ['v1.2.3', '!=', '1.2.4'] };
    expect(targeting.applyTargeting('flag', input, {})).toBeTruthy();
  });

  it('should support lt operator', () => {
    const input = { sem_ver: ['v1.2.3', '<', '1.2.4'] };
    expect(targeting.applyTargeting('flag', input, {})).toBeTruthy();
  });

  it('should support lte operator', () => {
    const input = { sem_ver: ['v1.2.3', '<=', '1.2.3'] };
    expect(targeting.applyTargeting('flag', input, {})).toBeTruthy();
  });

  it('should support gte operator', () => {
    const input = { sem_ver: ['v1.2.3', '>=', '1.2.3'] };
    expect(targeting.applyTargeting('flag', input, {})).toBeTruthy();
  });

  it('should support gt operator', () => {
    const input = { sem_ver: ['v1.2.4', '>', '1.2.3'] };
    expect(targeting.applyTargeting('flag', input, {})).toBeTruthy();
  });

  it('should support major comparison operator', () => {
    const input = { sem_ver: ['v1.2.3', '^', 'v1.0.0'] };
    expect(targeting.applyTargeting('flag', input, {})).toBeTruthy();
  });

  it('should support minor comparison operator', () => {
    const input = { sem_ver: ['v5.0.3', '~', 'v5.0.8'] };
    expect(targeting.applyTargeting('flag', input, {})).toBeTruthy();
  });

  it('should handle unknown operator', () => {
    const input = { sem_ver: ['v1.0.0', '-', 'v1.0.0'] };
    expect(targeting.applyTargeting('flag', input, {})).toBeFalsy();
  });

  it('should handle invalid inputs', () => {
    const input = { sem_ver: ['myVersion_1', '=', 'myVersion_1'] };
    expect(targeting.applyTargeting('flag', input, {})).toBeFalsy();
  });

  it('should validate inputs', () => {
    const input = { sem_ver: ['myVersion_2', '+', 'myVersion_1', 'myVersion_1'] };
    expect(targeting.applyTargeting('flag', input, {})).toBeFalsy();
  });
});

describe('fractional operator', () => {
  let targeting: Targeting;

  beforeAll(() => {
    targeting = new Targeting();
  });

  it('should evaluate valid rule', () => {
    const input = {
      fractional: [{ var: 'key' }, ['red', 50], ['blue', 50]],
    };

    expect(targeting.applyTargeting('flagA', input, { key: 'bucketKeyA' })).toBe('red');
  });

  it('should evaluate valid rule', () => {
    const input = {
      fractional: [{ var: 'key' }, ['red', 50], ['blue', 50]],
    };

    expect(targeting.applyTargeting('flagA', input, { key: 'bucketKeyB' })).toBe('blue');
  });

  it('should evaluate valid rule with targeting key', () => {
    const input = {
      fractional: [
        ['red', 50],
        ['blue', 50],
      ],
    };

    expect(targeting.applyTargeting('flagA', input, { targetingKey: 'bucketKeyB' })).toBe('blue');
  });
});

describe('fractional operator should validate', () => {
  let targeting: Targeting;

  beforeAll(() => {
    targeting = new Targeting();
  });

  it('bucket sum to be 100', () => {
    const input = {
      fractional: [
        ['red', 55],
        ['blue', 55],
      ],
    };

    expect(targeting.applyTargeting('flagA', input, { targetingKey: 'key' })).toBe(null);
  });

  it('buckets properties to have variant and fraction', () => {
    const input = {
      fractional: [
        ['red', 50],
        [100, 50],
      ],
    };

    expect(targeting.applyTargeting('flagA', input, { targetingKey: 'key' })).toBe(null);
  });
});

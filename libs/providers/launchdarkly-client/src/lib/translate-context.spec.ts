import translateContext from "./translate-context";
import TestLogger from "./test-logger";

describe('translateContext', () => {
  it('Uses the targetingKey as the user key', () => {
    const logger = new TestLogger();
    expect(translateContext(logger, { targetingKey: 'the-key' })).toEqual({ key: 'the-key', kind: 'user' });
    expect(logger.logs.length).toEqual(0);
  });

  it('gives targetingKey precedence over key', () => {
    const logger = new TestLogger();
    expect(translateContext(
      logger,
      { targetingKey: 'target-key', key: 'key-key' },
    )).toEqual({
      key: 'target-key',
      kind: 'user',
    });
    // Should log a warning about both being defined.
    expect(logger.logs.length).toEqual(1);
  });

  describe.each([
    ['name', 'value2'],
    ['firstName', 'value3'],
    ['lastName', 'value4'],
    ['email', 'value5'],
    ['avatar', 'value6'],
    ['ip', 'value7'],
    ['country', 'value8'],
    ['anonymous', true],
  ])('given correct built-in attributes', (key, value) => {
    const logger = new TestLogger();
    it('translates the key correctly', () => {
      expect(translateContext(
        logger,
        { targetingKey: 'the-key', [key]: value },
      )).toEqual({
        key: 'the-key',
        [key]: value,
        kind: 'user',
      });
      expect(logger.logs.length).toEqual(0);
    });
  });

  it.each(['key', 'targetingKey'])('handles key or targetingKey', (key) => {
    const logger = new TestLogger();
    expect(translateContext(
      logger,
      { [key]: 'the-key' },
    )).toEqual({
      key: 'the-key',
      kind: 'user',
    });
    expect(logger.logs.length).toEqual(0);
  });

  describe.each([
    ['name', 17],
    ['anonymous', 'value'],
  ])('given incorrect built-in attributes', (key, value) => {
    it('the bad key is omitted', () => {
      const logger = new TestLogger();
      expect(translateContext(
        logger,
        { targetingKey: 'the-key', [key]: value },
      )).toEqual({
        key: 'the-key',
        kind: 'user',
      });
      expect(logger.logs[0]).toMatch(new RegExp(`The attribute '${key}' must be of type.*`));
    });
  });

  it('accepts custom attributes', () => {
    const logger = new TestLogger();
    expect(translateContext(logger, { targetingKey: 'the-key', someAttr: 'someValue' })).toEqual({
      key: 'the-key',
      kind: 'user',
      someAttr: 'someValue',
    });
    expect(logger.logs.length).toEqual(0);
  });

  it('accepts string/boolean/number arrays', () => {
    const logger = new TestLogger();
    expect(translateContext(logger, {
      targetingKey: 'the-key',
      strings: ['a', 'b', 'c'],
      numbers: [1, 2, 3],
      booleans: [true, false],
    })).toEqual({
      key: 'the-key',
      kind: 'user',
      strings: ['a', 'b', 'c'],
      numbers: [1, 2, 3],
      booleans: [true, false],
    });
    expect(logger.logs.length).toEqual(0);
  });

  it('converts date to ISO strings', () => {
    const date = new Date();
    const logger = new TestLogger();
    expect(translateContext(
      logger,
      { targetingKey: 'the-key', date },
    )).toEqual({
      key: 'the-key',
      kind: 'user',
      date: date.toISOString(),
    });
    expect(logger.logs.length).toEqual(0);
  });

  it('can convert a single kind context', () => {
    const evaluationContext = {
      kind: 'organization',
      targetingKey: 'my-org-key',
    };

    const expectedContext = {
      kind: 'organization',
      key: 'my-org-key',
    };

    const logger = new TestLogger();
    expect(translateContext(logger, evaluationContext)).toEqual(expectedContext);
    expect(logger.logs.length).toEqual(0);
  });

  it('can convert a multi-context', () => {
    const evaluationContext = {
      kind: 'multi',
      organization: {
        targetingKey: 'my-org-key',
        myCustomAttribute: 'myAttributeValue',
      },
      user: {
        targetingKey: 'my-user-key',
      },
    };

    const expectedContext = {
      kind: 'multi',
      organization: {
        key: 'my-org-key',
        myCustomAttribute: 'myAttributeValue',
      },
      user: {
        key: 'my-user-key',
      },
    };

    const logger = new TestLogger();
    expect(translateContext(logger, evaluationContext)).toEqual(expectedContext);
    expect(logger.logs.length).toEqual(0);
  });

  it('can handle privateAttributes in a single context', () => {
    const evaluationContext = {
      kind: 'organization',
      name: 'the-org-name',
      targetingKey: 'my-org-key',
      myCustomAttribute: 'myCustomValue',
      privateAttributes: ['myCustomAttribute'],
    };

    const expectedContext = {
      kind: 'organization',
      name: 'the-org-name',
      key: 'my-org-key',
      myCustomAttribute: 'myCustomValue',
      _meta: {
        privateAttributes: ['myCustomAttribute'],
      },
    };

    const logger = new TestLogger();
    expect(translateContext(logger, evaluationContext)).toEqual(expectedContext);
    expect(logger.logs.length).toEqual(0);
  });

  it('detects a cycle and logs an error', () => {
    const a = {
      b: { c: {} },
    };

    a.b.c = a;
    const evaluationContext = {
      key: 'a-key',
      kind: 'singularity',
      a,
    };

    const expectedContext = {
      key: 'a-key',
      kind: 'singularity',
      a: { b: {} },
    };

    const logger = new TestLogger();
    expect(translateContext(logger, evaluationContext)).toEqual(expectedContext);
    expect(logger.logs.length).toEqual(1);
  });

  it('allows references in different branches', () => {
    const a = { test: 'test' };

    const evaluationContext = {
      key: 'a-key',
      kind: 'singularity',
      b: { a },
      c: { a },
    };

    const expectedContext = {
      key: 'a-key',
      kind: 'singularity',
      b: { a: { test: 'test' } },
      c: { a: { test: 'test' } },
    };

    const logger = new TestLogger();
    expect(translateContext(logger, evaluationContext)).toEqual(expectedContext);
    expect(logger.logs.length).toEqual(0);
  });
});

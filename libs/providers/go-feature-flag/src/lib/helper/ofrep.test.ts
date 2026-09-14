import { buildOfrepHeaders, OFREP_ENV_VARS, withoutOfrepEnvironment } from './ofrep';

describe('buildOfrepHeaders', () => {
  it('should return an empty list when neither apiKey nor headers are set', () => {
    expect(buildOfrepHeaders({})).toEqual([]);
  });

  it('should include X-API-Key when apiKey is set', () => {
    expect(buildOfrepHeaders({ apiKey: 'goff-key' })).toEqual([['X-API-Key', 'goff-key']]);
  });

  it('should omit X-API-Key when apiKey is empty', () => {
    expect(buildOfrepHeaders({ apiKey: '' })).toEqual([]);
  });

  it('should merge caller headers and let apiKey win over a caller X-API-Key', () => {
    expect(
      buildOfrepHeaders({
        apiKey: 'goff-key',
        headers: { 'X-API-Key': 'caller-supplied', 'X-Gateway': 'secret' },
      }),
    ).toEqual([
      ['X-Gateway', 'secret'],
      ['X-API-Key', 'goff-key'],
    ]);
  });

  it('should drop Content-Type from caller headers', () => {
    expect(buildOfrepHeaders({ headers: { 'Content-Type': 'text/plain', 'X-Keep': 'kept' } })).toEqual([
      ['X-Keep', 'kept'],
    ]);
  });
});

describe('withoutOfrepEnvironment', () => {
  afterEach(() => {
    for (const name of OFREP_ENV_VARS) {
      delete process.env[name];
    }
  });

  it.each(OFREP_ENV_VARS)('should hide %s from construct', (name) => {
    process.env[name] = 'from-the-environment';

    let seen: string | undefined;
    withoutOfrepEnvironment(() => {
      seen = process.env[name];
    });

    expect(seen).toBeUndefined();
  });

  it.each(OFREP_ENV_VARS)('should restore %s after construct returns', (name) => {
    process.env[name] = 'original-value';

    withoutOfrepEnvironment(() => 'ok');

    expect(process.env[name]).toBe('original-value');
  });

  it('should restore the environment even when construct throws', () => {
    process.env['OFREP_ENDPOINT'] = 'original-value';

    expect(() =>
      withoutOfrepEnvironment(() => {
        throw new Error('construction failed');
      }),
    ).toThrow('construction failed');

    expect(process.env['OFREP_ENDPOINT']).toBe('original-value');
  });

  it('should leave an unset variable unset rather than writing the string "undefined"', () => {
    withoutOfrepEnvironment(() => 'ok');

    // `process.env.X = undefined` stores "undefined", which passes the delegate's truthiness
    // guard - restoring by assignment would have been worse than not isolating at all.
    expect(process.env['OFREP_ENDPOINT']).toBeUndefined();
  });

  it('should not touch unrelated environment variables', () => {
    process.env['UNRELATED'] = 'leave-me';

    withoutOfrepEnvironment(() => {
      expect(process.env['UNRELATED']).toBe('leave-me');
    });

    expect(process.env['UNRELATED']).toBe('leave-me');
    delete process.env['UNRELATED'];
  });

  it('should return the value construct produces', () => {
    expect(withoutOfrepEnvironment(() => 42)).toBe(42);
  });
});

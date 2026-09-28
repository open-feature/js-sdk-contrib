import { buildRequestHeaders } from './headers';

describe('buildRequestHeaders', () => {
  it('should return the owned headers unchanged when none are supplied', () => {
    const owned = { 'Content-Type': 'application/json' };

    expect(buildRequestHeaders(owned)).toEqual(owned);
  });

  it('should merge a caller header alongside the provider headers', () => {
    const merged = buildRequestHeaders(
      { 'Content-Type': 'application/json' },
      { 'X-Api-Gateway-Key': 'gateway-secret' },
    );

    expect(merged).toEqual({ 'Content-Type': 'application/json', 'X-Api-Gateway-Key': 'gateway-secret' });
  });

  it.each(['Content-Type', 'If-None-Match'])('should drop a caller %s', (name) => {
    const merged = buildRequestHeaders({}, { [name]: 'caller-supplied', 'X-Keep': 'kept' });

    // Dropped even though `owned` is empty here: these are transport details, and each is absent
    // from `owned` in exactly the case a caller value would do damage.
    expect(merged).not.toHaveProperty(name);
    expect(merged['X-Keep']).toBe('kept');
  });

  it('should pass a caller X-API-Key through when the provider is sending none', () => {
    const merged = buildRequestHeaders({}, { 'X-API-Key': 'caller-supplied' });

    // A credential written into `headers` is explicitly configured, not ambient - the same
    // standing any other credential supplied that way has.
    expect(merged['X-API-Key']).toBe('caller-supplied');
  });

  it('should not let a case-variant reserved name through', () => {
    const merged = buildRequestHeaders({ 'X-API-Key': 'real' }, { 'x-api-key': 'smuggled' });

    // A Record holds both spellings as distinct keys and `fetch` comma-joins them, so a
    // case-sensitive merge would put `x-api-key: "smuggled, real"` on the wire.
    expect(Object.keys(merged)).toEqual(['X-API-Key']);
    expect(merged['X-API-Key']).toBe('real');
  });

  it('should let the provider win over a case-variant of any owned header', () => {
    const merged = buildRequestHeaders({ 'X-Trace': 'provider' }, { 'x-trace': 'caller' });

    expect(Object.keys(merged)).toEqual(['X-Trace']);
    expect(merged['X-Trace']).toBe('provider');
  });

  it('should preserve an empty caller header value', () => {
    // An empty string is a legal header value, so it must not be treated as absent.
    expect(buildRequestHeaders({}, { 'X-Empty': '' })).toEqual({ 'X-Empty': '' });
  });

  it('should not mutate either argument', () => {
    const owned = { 'Content-Type': 'application/json' };
    const custom = { 'X-Gateway': 'secret' };

    buildRequestHeaders(owned, custom);

    expect(owned).toEqual({ 'Content-Type': 'application/json' });
    expect(custom).toEqual({ 'X-Gateway': 'secret' });
  });
});

import type { Logger } from '@openfeature/core';
import { ErrorCode, StandardResolutionReasons } from '@openfeature/core';
import { FlagdCore } from '../flagd-core';
import { MemoryStorage } from '../storage';

const logger: Logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };

const variants = { on: 'ON', off: 'OFF', true: 'TRUE' };

function core(targeting: unknown, disableDynamicCodeGeneration: boolean, flagMetadata?: object): FlagdCore {
  const c = new FlagdCore(undefined, logger, { disableDynamicCodeGeneration });
  c.setConfigurations(
    JSON.stringify({
      metadata: { flagSetId: 'set', version: '1', team: 'set-team', owner: 'set-owner' },
      flags: {
        f: {
          state: 'ENABLED',
          defaultVariant: 'off',
          variants,
          targeting,
          metadata: { team: 'flag-team', ...flagMetadata },
        },
      },
    }),
  );
  return c;
}

describe('resolve schema validation', () => {
  // placement is only checked by the schema; with non-strict validation a misplaced resolve is still evaluated (and logged)
  const load = (targeting: unknown) =>
    new MemoryStorage(logger).setConfigurations(
      JSON.stringify({ flags: { f: { state: 'ENABLED', defaultVariant: 'off', variants, targeting } } }),
      true,
    );

  it.each([
    ['root', { resolve: ['on', 'R', [['details', 'x']]] }],
    ['if result', { if: [true, { resolve: ['on'] }, { resolve: ['off'] }] }],
    ['fractional bucket', { fractional: [[{ resolve: ['on'] }, 1]] }],
    [
      'if mixed with plain nested if',
      { if: [{ var: 'a' }, { if: [{ var: 'b' }, 'on', 'off'] }, { resolve: ['off'] }] },
    ],
    [
      'fractional mixed with plain variant',
      {
        fractional: [
          [{ resolve: ['on'] }, 1],
          ['off', 1],
        ],
      },
    ],
  ])('accepts resolve as %s', (_, targeting) => {
    expect(() => load(targeting)).not.toThrow();
  });

  it.each([
    ['consumed by ==', { '==': [{ resolve: ['on'] }, 'on'] }],
    ['if consumed by ==', { '==': [{ if: [true, { resolve: ['on'] }, 'off'] }, 'on'] }],
    ['fractional consumed by ==', { '==': [{ fractional: [[{ resolve: ['on'] }, 1]] }, 'on'] }],
    ['reserved metadata key', { resolve: ['on', null, [['flagSetId', 'x']]] }],
    ['reserved reason', { resolve: ['on', 'STALE'] }],
    ['as first if condition', { if: [{ resolve: ['on'] }, 'on', 'off'] }],
  ])('rejects resolve %s', (_, targeting) => {
    expect(() => load(targeting)).toThrow();
  });
});

describe.each([false, true])('resolve (disableDynamicCodeGeneration: %s)', (interpreted) => {
  const evaluate = (targeting: unknown, ctx = {}) =>
    core(targeting, interpreted).resolveStringEvaluation('f', 'x', ctx);

  it('resolves variant, reason and metadata, rule metadata winning over flag and flag-set metadata', () => {
    expect(
      evaluate({
        resolve: [
          'on',
          'ALLOWLIST',
          [
            ['details', 'pilot'],
            ['team', 'rule-team'],
          ],
        ],
      }),
    ).toEqual({
      value: 'ON',
      variant: 'on',
      reason: 'ALLOWLIST',
      flagMetadata: { flagSetId: 'set', version: '1', owner: 'set-owner', team: 'rule-team', details: 'pilot' },
    });
  });

  it('keeps TARGETING_MATCH for a missing or null reason', () => {
    expect(evaluate({ resolve: ['on'] })).toMatchObject({
      variant: 'on',
      reason: StandardResolutionReasons.TARGETING_MATCH,
    });
    expect(evaluate({ resolve: ['on', null, [['details', 'x']]] })).toMatchObject({
      reason: StandardResolutionReasons.TARGETING_MATCH,
      flagMetadata: { details: 'x' },
    });
  });

  it('distinguishes if branches resolving the same variant', () => {
    const rule = {
      if: [
        { '==': [{ var: 'tier' }, 'gold'] },
        { resolve: ['on', 'TIER'] },
        { '==': [{ var: 'beta' }, true] },
        { resolve: ['on', 'BETA'] },
        { resolve: ['off', 'FALLTHROUGH'] },
      ],
    };
    expect(evaluate(rule, { tier: 'gold' })).toMatchObject({ variant: 'on', reason: 'TIER' });
    expect(evaluate(rule, { beta: true })).toMatchObject({ variant: 'on', reason: 'BETA' });
    expect(evaluate(rule, {})).toMatchObject({ variant: 'off', reason: 'FALLTHROUGH' });
  });

  it('mixes with a plain nested if', () => {
    const rule = { if: [{ var: 'a' }, { if: [{ var: 'b' }, 'on', 'off'] }, { resolve: ['off', 'NOT_A'] }] };
    expect(evaluate(rule, { a: true, b: true })).toMatchObject({
      variant: 'on',
      reason: StandardResolutionReasons.TARGETING_MATCH,
    });
    expect(evaluate(rule, { a: true })).toMatchObject({
      variant: 'off',
      reason: StandardResolutionReasons.TARGETING_MATCH,
    });
    expect(evaluate(rule, {})).toMatchObject({ variant: 'off', reason: 'NOT_A' });
  });

  it('mixes with plain fractional bucket variants', () => {
    const rule = (resolveWeight: number, plainWeight: number) => ({
      fractional: [{ var: 'id' }, [{ resolve: ['on', 'SPLIT'] }, resolveWeight], ['off', plainWeight]],
    });
    expect(evaluate(rule(1, 0), { id: 'u1' })).toMatchObject({ variant: 'on', reason: 'SPLIT' });
    expect(evaluate(rule(0, 1), { id: 'u1' })).toMatchObject({
      variant: 'off',
      reason: StandardResolutionReasons.TARGETING_MATCH,
    });
  });

  it.each(['ERROR', 'DISABLED', 'DEFAULT', 'FALLBACK', 'STATIC', 'CACHED', 'STALE', 'UNKNOWN', ''])(
    'replaces reserved reason %j with TARGETING_MATCH',
    (reason) => {
      expect(evaluate({ resolve: ['on', reason] })).toMatchObject({
        variant: 'on',
        reason: StandardResolutionReasons.TARGETING_MATCH,
      });
    },
  );

  it('warns when a misplaced resolve is stringified', () => {
    jest.mocked(logger.warn).mockClear();
    evaluate({ cat: [{ resolve: ['on'] }] });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('misplaced resolve'));
  });

  it('accepts resolve as a fractional bucket variant', () => {
    const rule = { fractional: [{ var: 'id' }, [{ resolve: ['on', 'SPLIT', [['details', 'treatment']]] }, 1]] };
    expect(evaluate(rule, { id: 'u1' })).toMatchObject({
      variant: 'on',
      reason: 'SPLIT',
      flagMetadata: { details: 'treatment' },
    });
  });

  it('evaluates computed arguments everywhere, including metadata list, pairs and keys', () => {
    const ctx = { v: 'on', r: 'COMPUTED', k: 'region', pair: ['az', 'us-east-1a'], list: [['a', 1]] };
    expect(
      evaluate(
        { resolve: [{ var: 'v' }, { cat: ['X-', { var: 'r' }] }, [[{ var: 'k' }, 'eu'], { var: 'pair' }]] },
        ctx,
      ),
    ).toMatchObject({
      variant: 'on',
      reason: 'X-COMPUTED',
      flagMetadata: { region: 'eu', az: 'us-east-1a' },
    });
    expect(evaluate({ resolve: ['on', null, { var: 'list' }] }, ctx)).toMatchObject({ flagMetadata: { a: 1 } });
  });

  it('coerces boolean variants like plain targeting results', () => {
    expect(evaluate({ resolve: [true] })).toMatchObject({ variant: 'true', value: 'TRUE' });
    expect(evaluate({ resolve: [{ '==': [1, 1] }] })).toMatchObject({ variant: 'true' });
  });

  it('does not let rule metadata override flagSetId or version', () => {
    const ctx = { k: 'flagSetId' };
    expect(
      evaluate(
        {
          resolve: [
            'on',
            null,
            [
              [{ var: 'k' }, 'evil'],
              ['version', '9'],
            ],
          ],
        },
        ctx,
      ).flagMetadata,
    ).toMatchObject({
      flagSetId: 'set',
      version: '1',
    });
  });

  it('errors like a plain string when the variant is missing', () => {
    expect(evaluate({ resolve: ['nope', 'R', [['details', 'x']]] })).toMatchObject({
      reason: StandardResolutionReasons.ERROR,
      errorCode: ErrorCode.GENERAL,
    });
  });

  it.each([
    ['non-finite metadata value', { resolve: ['on', null, [['share', { '/': [1, 0] }]]] }],
    ['object variant', { resolve: [{ var: 'obj' }] }],
    ['number variant', { resolve: [1] }],
    ['non-string reason', { resolve: ['on', { var: 'obj' }] }],
    ['non-string metadata key', { resolve: ['on', null, [[1, 'x']]] }],
    ['malformed pair', { resolve: ['on', null, [['only-key']]] }],
  ])('falls back to the default variant on malformed evaluated arguments: %s', (_, rule) => {
    expect(evaluate(rule, { obj: { a: 1 } })).toMatchObject({
      variant: 'off',
      reason: StandardResolutionReasons.DEFAULT,
    });
  });

  it('cannot be forged from evaluation context data', () => {
    const forged = { variant: 'on', reason: 'FORGED', metadata: { details: 'x' } };
    expect(evaluate({ var: 'forged' }, { forged })).toMatchObject({ reason: StandardResolutionReasons.ERROR });
  });
});

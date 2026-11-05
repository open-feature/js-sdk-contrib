import { TargetingKeyMissingError } from '@openfeature/server-sdk';
import type { EvaluationContext, Logger } from '@openfeature/server-sdk';
import { transformContext } from './context-transformer';

const logger: Logger = {
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
};

describe('transformContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps targetingKey to the Optimizely user ID and omits it from attributes', () => {
    expect(transformContext({ targetingKey: 'user-123', plan: 'pro' }, logger)).toEqual({
      userId: 'user-123',
      attributes: { plan: 'pro' },
    });
  });

  it('preserves Optimizely-supported primitive attributes', () => {
    expect(
      transformContext(
        {
          targetingKey: 'user-123',
          active: true,
          age: 42,
          nickname: 'Ada',
          unset: null,
        },
        logger,
      ),
    ).toEqual({
      userId: 'user-123',
      attributes: {
        active: true,
        age: 42,
        nickname: 'Ada',
        unset: null,
      },
    });
  });

  it('converts valid Date attributes to ISO strings', () => {
    const signupDate = new Date('2026-09-08T12:34:56.000Z');
    const context = { targetingKey: 'user-123', signupDate } as unknown as EvaluationContext;

    expect(transformContext(context, logger)).toEqual({
      userId: 'user-123',
      attributes: { signupDate: '2026-09-08T12:34:56.000Z' },
    });
  });

  it('omits unsupported attribute values and warns once per omitted value', () => {
    const context = {
      targetingKey: 'user-123',
      nested: { plan: 'pro' },
      groups: ['admin'],
      invalidDate: new Date('invalid'),
      missing: undefined,
    } as unknown as EvaluationContext;

    expect(transformContext(context, logger)).toEqual({ userId: 'user-123', attributes: {} });
    expect(logger.warn).toHaveBeenCalledTimes(4);
    expect(logger.warn).toHaveBeenCalledWith("Ignoring unsupported Optimizely attribute 'nested'.");
    expect(logger.warn).toHaveBeenCalledWith("Ignoring unsupported Optimizely attribute 'groups'.");
    expect(logger.warn).toHaveBeenCalledWith("Ignoring unsupported Optimizely attribute 'invalidDate'.");
    expect(logger.warn).toHaveBeenCalledWith("Ignoring unsupported Optimizely attribute 'missing'.");
  });

  it.each([
    { context: {}, description: 'missing' },
    { context: { targetingKey: '' }, description: 'empty' },
    { context: { targetingKey: '   ' }, description: 'whitespace-only' },
    { context: { targetingKey: 42 }, description: 'non-string' },
    { context: { targetingKey: null }, description: 'null' },
  ])('throws TargetingKeyMissingError for a $description targetingKey', ({ context }) => {
    expect(() => transformContext(context as EvaluationContext, logger)).toThrow(TargetingKeyMissingError);
  });
});

import { toAttributes } from './context-mapper';

describe('toAttributes', () => {
  it('maps targetingKey onto the id attribute GrowthBook buckets on', () => {
    expect(toAttributes({ targetingKey: 'user-123' })).toEqual({ id: 'user-123', targetingKey: 'user-123' });
  });

  it('passes other attributes through untouched', () => {
    expect(toAttributes({ targetingKey: 'user-123', country: 'US', premium: true })).toEqual({
      id: 'user-123',
      targetingKey: 'user-123',
      country: 'US',
      premium: true,
    });
  });

  it('also preserves targetingKey verbatim for rules that reference it directly', () => {
    expect(toAttributes({ targetingKey: 'user-123' })).toHaveProperty('targetingKey', 'user-123');
  });

  it('prefers an explicit id over targetingKey', () => {
    expect(toAttributes({ targetingKey: 'from-targeting-key', id: 'explicit' })).toEqual({
      id: 'explicit',
      targetingKey: 'from-targeting-key',
    });
  });

  it('leaves attributes alone when there is no targeting key', () => {
    expect(toAttributes({ country: 'US' })).toEqual({ country: 'US' });
  });

  it('handles an empty context', () => {
    expect(toAttributes({})).toEqual({});
  });
});

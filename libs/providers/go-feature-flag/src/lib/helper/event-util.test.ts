import type { EvaluationContext } from '@openfeature/core';
import { getContextKind } from './event-util';

/**
 * The specification's `contextKind` table is normative and is transcribed here row for row. It
 * exists because a truthiness test and an identity test agree on the common cases and diverge on
 * the rest, so the interesting rows are the ones that are not `true` or `false`.
 */
describe('getContextKind', () => {
  it.each([
    { label: 'boolean true', context: { anonymous: true }, expected: 'anonymousUser' },
    { label: 'boolean false', context: { anonymous: false }, expected: 'user' },
    { label: 'absent', context: { targetingKey: 'user-1' }, expected: 'user' },
    { label: 'evaluation context absent', context: undefined, expected: 'user' },
    { label: 'the string "true"', context: { anonymous: 'true' }, expected: 'user' },
    { label: 'the number 1', context: { anonymous: 1 }, expected: 'user' },
    { label: 'an empty context', context: {}, expected: 'user' },
  ])('should return $expected when anonymous is $label', ({ context, expected }) => {
    expect(getContextKind(context as EvaluationContext | undefined)).toBe(expected);
  });

  it('should not treat an absent context as anonymous', () => {
    // The `!context ||` disjunct used to invert this row, so every event produced without an
    // evaluation context was mis-bucketed and analytics overstated anonymous traffic.
    expect(getContextKind()).toBe('user');
  });
});

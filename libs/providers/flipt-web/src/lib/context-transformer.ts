import { EvaluationContext } from '@openfeature/web-sdk';

export function transformContext(context: EvaluationContext): Record<string, string> {
  const evalContext: Record<string, string> = {};
  for (const value in context) {
    if (value !== 'targetingKey') {
      evalContext[value] = context[value]?.toString() ?? '';
    }
  }

  return evalContext;
}

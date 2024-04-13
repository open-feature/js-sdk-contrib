import { EvaluationContext } from '@openfeature/server-sdk';
import { transformContext } from './context-transformer';

describe('context-transformer', () => {
  describe('transformContext', () => {
    it('should transform context correctly', () => {
      const context: EvaluationContext = {
        targetingKey: 'entity',
        customProp: 'test',
      };

      const transformedContext: Record<string, string> = transformContext(context);

      expect(transformedContext['customProp']).toBe('test');
      expect(transformedContext['targetingKey']).toBeUndefined();
    });
  });
});

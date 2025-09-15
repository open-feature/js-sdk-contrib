import type { EvaluationContext } from '@openfeature/core';
import { transformContext } from './context-transformer';

describe('context-transformer', () => {
  describe('transformContext', () => {
    it('map targeting key to identifier', () => {
      const context: EvaluationContext = {
        targetingKey: 'test',
      };

      const user = {
        identifier: context['targetingKey'],
        email: undefined,
        country: undefined,
        custom: {
          targetingKey: context['targetingKey'],
        },
      };

      expect(transformContext(context)).toEqual(user);
    });

    it('map email and country correctly', () => {
      const context: EvaluationContext = {
        targetingKey: 'test',
        email: 'email',
        country: 'country',
      };

      const user = {
        identifier: context['targetingKey'],
        email: context['email'],
        country: context['country'],
        custom: {
          targetingKey: context['targetingKey'],
          email: context['email'],
          country: context['country'],
        },
      };

      expect(transformContext(context)).toEqual(user);
    });

    it('map custom property with string', () => {
      const context: EvaluationContext = {
        targetingKey: 'test',
        customString: 'customString',
      };

      const user = {
        identifier: context['targetingKey'],
        custom: {
          targetingKey: context['targetingKey'],
          customString: context['customString'],
        },
      };

      expect(transformContext(context)).toEqual(user);
    });

    it('map custom property with number', () => {
      const context: EvaluationContext = {
        targetingKey: 'test',
        customNumber: 1,
      };

      const user = {
        identifier: context['targetingKey'],
        custom: {
          targetingKey: context['targetingKey'],
          customNumber: context['customNumber'],
        },
      };

      expect(transformContext(context)).toEqual(user);
    });

    it('map custom property with boolean', () => {
      const context: EvaluationContext = {
        targetingKey: 'test',
        customBoolean: true,
      };

      const user = {
        identifier: context['targetingKey'],
        custom: {
          targetingKey: context['targetingKey'],
          customBoolean: context['customBoolean'],
        },
      };

      expect(transformContext(context)).toEqual(user);
    });

    it('map custom property with object to JSON string', () => {
      const context: EvaluationContext = {
        targetingKey: 'test',
        customObject: {
          prop1: '1',
          prop2: 2,
        },
      };

      const user = {
        identifier: context['targetingKey'],
        custom: {
          targetingKey: context['targetingKey'],
          customObject: JSON.stringify(context['customObject']),
        },
      };

      expect(transformContext(context)).toEqual(user);
    });

    it('map custom property with string array to string array', () => {
      const context: EvaluationContext = {
        targetingKey: 'test',
        customArray: ['one', 'two', 'three'],
      };

      const user = {
        identifier: context['targetingKey'],
        custom: {
          targetingKey: context['targetingKey'],
          customArray: context['customArray'],
        },
      };

      expect(transformContext(context)).toEqual(user);
    });

    it('map custom property with mixed array to JSON string', () => {
      const context: EvaluationContext = {
        targetingKey: 'test',
        customArray: [1, '2', false],
      };

      const user = {
        identifier: context['targetingKey'],
        custom: {
          targetingKey: context['targetingKey'],
          customArray: JSON.stringify(context['customArray']),
        },
      };

      expect(transformContext(context)).toEqual(user);
    });

    it('map several custom properties correctly', () => {
      const context: EvaluationContext = {
        targetingKey: 'test',
        email: 'email',
        country: 'country',
        customString: 'customString',
        customNumber: 1,
        customBoolean: true,
        customObject: {
          prop1: '1',
          prop2: 2,
        },
        customArray: [1, '2', false],
      };

      const user = {
        identifier: 'test',
        email: 'email',
        country: 'country',
        custom: {
          targetingKey: context['targetingKey'],
          email: context['email'],
          country: context['country'],
          customString: context['customString'],
          customBoolean: context['customBoolean'],
          customNumber: context['customNumber'],
          customObject: JSON.stringify(context['customObject']),
          customArray: JSON.stringify(context['customArray']),
        },
      };

      expect(transformContext(context)).toEqual(user);
    });

    it('map identifier if targetingKey is not present', () => {
      const context: EvaluationContext = {
        identifier: 'test',
      };

      const user = {
        identifier: 'test',
        custom: {
          identifier: context['identifier'],
        },
      };

      expect(transformContext(context)).toEqual(user);
    });
  });
});

import { EvaluationContext } from '@openfeature/core';
import { transformContext } from './context-transformer';

describe('context-transformer', () => {
  describe('transformContext', () => {
    it('map targeting key to identifier', () => {
      const context: EvaluationContext = {
        targetingKey: 'test',
      };

      const user = {
        identifier: context['targetingKey'],
        country: undefined,
        custom: {},
        email: undefined,
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
        custom: {},
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
          customString: context['customString'],
        },
      };

      expect(transformContext(context)).toEqual(user);
    });

    it('map custom property with number to string', () => {
      const context: EvaluationContext = {
        targetingKey: 'test',
        customNumber: 1,
      };

      const user = {
        identifier: context['targetingKey'],
        custom: {
          customNumber: '1',
        },
      };

      expect(transformContext(context)).toEqual(user);
    });

    it('map custom property with boolean to string', () => {
      const context: EvaluationContext = {
        targetingKey: 'test',
        customBoolean: true,
      };

      const user = {
        identifier: context['targetingKey'],
        custom: {
          customBoolean: 'true',
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
          customObject: JSON.stringify(context['customObject']),
        },
      };

      expect(transformContext(context)).toEqual(user);
    });

    it('map custom property with array to JSON string', () => {
      const context: EvaluationContext = {
        targetingKey: 'test',
        customArray: [1, '2', false],
      };

      const user = {
        identifier: context['targetingKey'],
        custom: {
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
          customString: 'customString',
          customBoolean: 'true',
          customNumber: '1',
          customObject: '{"prop1":"1","prop2":2}',
          customArray: '[1,"2",false]',
        },
      };

      expect(transformContext(context)).toEqual(user);
    });
  });
});

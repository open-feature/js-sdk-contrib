import type { EvaluationDetails, FlagValue, HookContext, Logger } from '@openfeature/core';
import { ErrorCode, GeneralError } from '@openfeature/core';
import { InMemoryProvider as WebInMemoryProvider, OpenFeature as OpenFeatureWeb } from '@openfeature/web-sdk';
import { InMemoryProvider as ServerInMemoryProvider, OpenFeature as OpenFeatureServer } from '@openfeature/server-sdk';
import { SchemaValidationHook } from './schema-validation-hook';
import type { StandardSchemaV1, StandardSchemaV1Issue } from './standard-schema';

/**
 * A minimal Standard Schema implementation, so the tests don't depend on a specific schema library.
 */
function schema(check: (value: unknown) => StandardSchemaV1Issue[] | undefined): StandardSchemaV1 {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (value) => {
        const issues = check(value);
        return issues ? { issues } : { value };
      },
    },
  };
}

const stringSchema = schema((value) => (typeof value === 'string' ? undefined : [{ message: 'Expected a string' }]));

const colorSchema = schema((value) =>
  value === 'red' || value === 'green' ? undefined : [{ message: 'Expected "red" or "green"' }],
);

const objectSchema = schema((value) => {
  const limit = (value as { limits?: { max?: unknown } })?.limits?.max;
  return typeof limit === 'number' ? undefined : [{ message: 'Expected a number', path: ['limits', { key: 'max' }] }];
});

const asyncSchema: StandardSchemaV1 = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: async (value) => ({ value }),
  },
};

function makeLogger(): Logger {
  return { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
}

function run(hook: SchemaValidationHook, flagKey: string, value: FlagValue, logger: Logger = makeLogger()) {
  hook.after({ flagKey, logger } as unknown as HookContext, { flagKey, value } as EvaluationDetails<FlagValue>);
}

describe('SchemaValidationHook', () => {
  describe('with a single schema', () => {
    const hook = new SchemaValidationHook(stringSchema);

    it('should accept a valid value', () => {
      expect(() => run(hook, 'flag', 'hello')).not.toThrow();
    });

    it('should throw a GeneralError for an invalid value', () => {
      expect(() => run(hook, 'flag', 42)).toThrow(GeneralError);
      expect(() => run(hook, 'flag', 42)).toThrow('Value of flag "flag" does not match its schema: Expected a string');
    });

    it('should include the issue path in the error message', () => {
      const objectHook = new SchemaValidationHook(objectSchema);
      expect(() => run(objectHook, 'flag', { limits: { max: 'ten' } })).toThrow('limits.max: Expected a number');
    });
  });

  describe('with a schema map', () => {
    const hook = new SchemaValidationHook({ color: colorSchema });

    it('should validate flags that have a schema', () => {
      expect(() => run(hook, 'color', 'red')).not.toThrow();
      expect(() => run(hook, 'color', 'blue')).toThrow(GeneralError);
    });

    it('should skip flags without a schema', () => {
      expect(() => run(hook, 'other-flag', 12345)).not.toThrow();
    });
  });

  describe('options', () => {
    it('should log a warning instead of throwing when onInvalid is "log"', () => {
      const logger = makeLogger();
      const hook = new SchemaValidationHook(stringSchema, { onInvalid: 'log' });

      expect(() => run(hook, 'flag', 42, logger)).not.toThrow();
      expect(logger.warn).toHaveBeenCalledWith('Value of flag "flag" does not match its schema: Expected a string');
    });

    it('should prefer the logger passed in the options', () => {
      const contextLogger = makeLogger();
      const optionsLogger = makeLogger();
      const hook = new SchemaValidationHook(stringSchema, { onInvalid: 'log', logger: optionsLogger });

      run(hook, 'flag', 42, contextLogger);

      expect(optionsLogger.warn).toHaveBeenCalledTimes(1);
      expect(contextLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('asynchronous schemas', () => {
    it('should treat a schema that validates asynchronously as invalid', () => {
      const hook = new SchemaValidationHook(asyncSchema);
      expect(() => run(hook, 'flag', 'hello')).toThrow(
        'Schema for flag "flag" validates asynchronously, which is not supported',
      );
    });

    it('should log instead of throwing when onInvalid is "log"', () => {
      const logger = makeLogger();
      const hook = new SchemaValidationHook(asyncSchema, { onInvalid: 'log' });

      expect(() => run(hook, 'flag', 'hello', logger)).not.toThrow();
      expect(logger.warn).toHaveBeenCalledTimes(1);
    });

    it('should treat a thenable that is not a native promise as asynchronous', () => {
      const thenableSchema: StandardSchemaV1 = {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: (value) => {
            const thenable = { then: (resolve: (result: { value: unknown }) => void) => resolve({ value }) };
            return thenable as unknown as Promise<{ value: unknown }>;
          },
        },
      };
      const hook = new SchemaValidationHook(thenableSchema);

      expect(() => run(hook, 'flag', 'hello')).toThrow('validates asynchronously, which is not supported');
    });

    it('should accept a synchronous result that also has a then function', () => {
      const schemaWithThen: StandardSchemaV1 = {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: (value) => {
            const result = { value, then: () => undefined };
            return result;
          },
        },
      };
      const hook = new SchemaValidationHook(schemaWithThen);

      expect(() => run(hook, 'flag', 'hello')).not.toThrow();
    });
  });

  describe('SDK compatibility', () => {
    const flags = {
      'valid-color': { variants: { on: 'red' }, defaultVariant: 'on', disabled: false },
      'invalid-color': { variants: { on: 'blue' }, defaultVariant: 'on', disabled: false },
    };

    describe('web-sdk', () => {
      const domain = 'schema-validation-web';

      beforeAll(async () => {
        await OpenFeatureWeb.setProviderAndWait(domain, new WebInMemoryProvider(flags));
      });

      afterAll(async () => {
        await OpenFeatureWeb.clearProviders();
      });

      it('should return the evaluated value when it matches the schema', () => {
        const client = OpenFeatureWeb.getClient(domain);
        client.addHooks(new SchemaValidationHook(colorSchema));
        const details = client.getStringDetails('valid-color', 'green');

        expect(details.value).toEqual('red');
        expect(details.errorCode).toBeUndefined();
      });

      it('should return the default value and an error when the value does not match the schema', () => {
        const client = OpenFeatureWeb.getClient(domain);
        client.addHooks(new SchemaValidationHook(colorSchema));
        const details = client.getStringDetails('invalid-color', 'green');

        expect(details.value).toEqual('green');
        expect(details.errorCode).toEqual(ErrorCode.GENERAL);
        expect(details.errorMessage).toContain('does not match its schema');
      });
    });

    describe('server-sdk', () => {
      const domain = 'schema-validation-server';

      beforeAll(async () => {
        await OpenFeatureServer.setProviderAndWait(domain, new ServerInMemoryProvider(flags));
      });

      afterAll(async () => {
        await OpenFeatureServer.clearProviders();
      });

      it('should return the evaluated value when it matches the schema', async () => {
        const client = OpenFeatureServer.getClient(domain);
        client.addHooks(new SchemaValidationHook(colorSchema));
        const details = await client.getStringDetails('valid-color', 'green');

        expect(details.value).toEqual('red');
        expect(details.errorCode).toBeUndefined();
      });

      it('should return the default value and an error when the value does not match the schema', async () => {
        const client = OpenFeatureServer.getClient(domain);
        client.addHooks(new SchemaValidationHook(colorSchema));
        const details = await client.getStringDetails('invalid-color', 'green');

        expect(details.value).toEqual('green');
        expect(details.errorCode).toEqual(ErrorCode.GENERAL);
        expect(details.errorMessage).toContain('does not match its schema');
      });
    });
  });
});

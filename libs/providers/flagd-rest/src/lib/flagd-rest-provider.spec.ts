import {
  ErrorCode,
  FlagValueType,
  TypeMismatchError,
} from '@openfeature/nodejs-sdk';
import * as nock from 'nock';
import { FlagdRESTProvider } from './flagd-rest-provider';

type SuccessfulTest = {
  flagValueType: FlagValueType;
  defaultValue: any;
  reply: { code: number; body: { value: any } };
  expectedValue: { value: any };
};

type ErrorTest = {
  flagValueType: FlagValueType;
  defaultValue: any;
  reply: { code: number; body: { errorCode?: string } };
  expectedValue: { new (...args: any[]): Error };
};

describe('FlagdRESTProvider', () => {
  const flagName = 'testFlag';
  const flagdRESTProvider = new FlagdRESTProvider();

  const successfulTests: Array<SuccessfulTest> = [
    {
      flagValueType: 'boolean',
      defaultValue: false,
      reply: { code: 200, body: { value: true } },
      expectedValue: { value: true },
    },
    {
      flagValueType: 'string',
      defaultValue: 'red',
      reply: { code: 200, body: { value: 'blue' } },
      expectedValue: { value: 'blue' },
    },
    {
      flagValueType: 'number',
      defaultValue: 0,
      reply: { code: 200, body: { value: 1 } },
      expectedValue: { value: 1 },
    },
    {
      flagValueType: 'object',
      defaultValue: { size: 'small' },
      reply: { code: 200, body: { value: { size: 'large' } } },
      expectedValue: { value: { size: 'large' } },
    },
  ];

  const errorTests: Array<ErrorTest> = [
    {
      flagValueType: 'boolean',
      defaultValue: false,
      reply: { code: 400, body: { errorCode: ErrorCode.TYPE_MISMATCH } },
      expectedValue: TypeMismatchError,
    },
    {
      flagValueType: 'string',
      defaultValue: 'red',
      reply: { code: 400, body: { errorCode: ErrorCode.TYPE_MISMATCH } },
      expectedValue: TypeMismatchError,
    },
    {
      flagValueType: 'number',
      defaultValue: 0,
      reply: { code: 400, body: { errorCode: ErrorCode.TYPE_MISMATCH } },
      expectedValue: TypeMismatchError,
    },
    {
      flagValueType: 'object',
      defaultValue: { size: 'small' },
      reply: { code: 400, body: { errorCode: ErrorCode.TYPE_MISMATCH } },
      expectedValue: TypeMismatchError,
    },
  ];

  function setupNock(flagValueType: string, code: number, body: any) {
    nock('http://localhost:8080')
      .post(`/flags/${flagName}/resolve/${flagValueType}`)
      // All QS will match
      .query(() => true)
      .reply(code, body);
  }

  async function resolveValue(flagValueType: FlagValueType, defaultValue: any) {
    let output;

    if (flagValueType === 'boolean') {
      output = await flagdRESTProvider.resolveBooleanEvaluation(
        flagName,
        defaultValue,
        {}
      );
    } else if (flagValueType === 'number') {
      output = await flagdRESTProvider.resolveNumberEvaluation(
        flagName,
        defaultValue,
        {}
      );
    } else if (flagValueType === 'string') {
      output = await flagdRESTProvider.resolveStringEvaluation(
        flagName,
        defaultValue,
        {}
      );
    } else if (flagValueType === 'object') {
      output = await flagdRESTProvider.resolveObjectEvaluation(
        flagName,
        defaultValue,
        {}
      );
    }

    return output;
  }

  beforeAll(() => {
    nock.disableNetConnect();
  });

  afterAll(() => {
    nock.enableNetConnect();
    nock.cleanAll();
    nock.restore();
  });

  successfulTests.forEach(
    ({ flagValueType, defaultValue, reply, expectedValue }) => {
      it(`should return ${JSON.stringify(
        expectedValue.value
      )} for a successful ${flagValueType} evaluation`, async () => {
        setupNock(flagValueType, reply.code, reply.body);
        const output = await resolveValue(flagValueType, defaultValue);

        expect(output).toStrictEqual(expectedValue);
      });
    }
  );

  errorTests.forEach(
    ({ flagValueType, defaultValue, reply, expectedValue }) => {
      it(`should throw because a status code of ${reply.code} was during a ${flagValueType} evaluation`, async () => {
        setupNock(flagValueType, reply.code, reply.body);

        try {
          const output = await resolveValue(flagValueType, defaultValue);

          expect(output).toBeUndefined();
        } catch (err) {
          expect(err).toBeInstanceOf(expectedValue);
        }
      });
    }
  );
});

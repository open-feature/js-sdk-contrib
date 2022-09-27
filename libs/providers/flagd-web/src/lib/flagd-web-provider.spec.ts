import { ERROR_DISABLED, ERROR_PARSE_ERROR, FlagdProvider } from './flagd-web-provider';
import fetchMock from "jest-fetch-mock";
import {
  OpenFeature,
  Client,
  ErrorCode,
  StandardResolutionReasons,
} from '@openfeature/nodejs-sdk';
import {
  Code,
  codeToString,
} from "@bufbuild/connect-web";

describe('FlagdProvider', () => {

  fetchMock.enableMocks();

  it('should be and instance of FlagdProvider', () => {
    expect(new FlagdProvider()).toBeInstanceOf(FlagdProvider);
  });

  describe('http service tests', () => {
    let client: Client;

    beforeEach(() => {
      OpenFeature.setProvider(new FlagdProvider());
      client = OpenFeature.getClient('test');
    });

    afterEach(() => {
      fetchMock.resetMocks();
    });

    describe('happy path tests', () => {
      it('get boolean happy path', async () => {
        const flagKey = 'boolFlag';
        fetchMock.mockResponseOnce(JSON.stringify({
          variant: 'success',
          value: true,
          reason: StandardResolutionReasons.STATIC,
        }), {headers: {
          "Content-Type":"application/json"
        }})
        const res = await client
          .getBooleanValue(flagKey, false)
          .catch((err) => {
            expect(err).toBeUndefined();
          });
        expect(res).toEqual(true);
      });
      it('get string happy path', async () => {
        const flagKey = 'stringFlag';
        fetchMock.mockResponseOnce(JSON.stringify({
          variant: 'success',
          value: "true",
          reason: StandardResolutionReasons.STATIC,
        }), {headers: {
          "Content-Type":"application/json"
        }})
        const res = await client
          .getStringValue(flagKey, "false")
          .catch((err) => {
            expect(err).toBeUndefined();
          });
        expect(res).toEqual("true");
      });
      it('get number happy path', async () => {
        const flagKey = 'numberFlag';
        fetchMock.mockResponseOnce(JSON.stringify({
          variant: 'success',
          value: 1,
          reason: StandardResolutionReasons.STATIC,
        }), {headers: {
          "Content-Type":"application/json"
        }})
        const res = await client
          .getNumberValue(flagKey, 0)
          .catch((err) => {
            expect(err).toBeUndefined();
          });
        expect(res).toEqual(1);
      });
      it('get object happy path', async () => {
        const flagKey = 'objectFlag';
        fetchMock.mockResponseOnce(JSON.stringify({
          variant: 'success',
          value: {foo:"bar"},
          reason: StandardResolutionReasons.STATIC,
        }), {headers: {
          "Content-Type":"application/json"
        }})
        const res = await client
          .getObjectValue(flagKey, {food:"bars"})
          .catch((err) => {
            expect(err).toBeUndefined();
          });
        expect(res).toEqual({foo:"bar"});
      });
    });
  });

  describe('common errors', () => {
    let client: Client;

    beforeEach(() => {
      OpenFeature.setProvider(new FlagdProvider());
      client = OpenFeature.getClient('test');
    });

    afterEach(() => {
      fetchMock.resetMocks();
    });
    it('flag not found', async () => {
      const flagKey = 'notBoolFlag';
      fetchMock.mockResponseOnce(JSON.stringify({
        code: codeToString(Code.NotFound),
        message:"",
      }), {
        headers: {
        "Content-Type":"application/json"
        },
        status: 404,
      })
      const res = await client
        .getBooleanDetails(flagKey, false)
        .catch((err) => {
          expect(err).toBeUndefined();
        });
      if (res) {
        expect(res.reason).toEqual(StandardResolutionReasons.ERROR);
        expect(res.errorCode).toEqual(ErrorCode.FLAG_NOT_FOUND);
      } else {
        expect(res).not.toBeNull();
      }
    });
    it('type mismatch', async () => {
      const flagKey = 'BoolFlag';
      fetchMock.mockResponseOnce(JSON.stringify({
        code: codeToString(Code.InvalidArgument),
        message:"",
      }), {
        headers: {
        "Content-Type":"application/json"
        },
        status: 400,
      })
      const res = await client
        .getStringDetails(flagKey, "")
        .catch((err) => {
          expect(err).toBeUndefined();
        });
      if (res) {
        expect(res.reason).toEqual(StandardResolutionReasons.ERROR);
        expect(res.errorCode).toEqual(ErrorCode.TYPE_MISMATCH);
      } else {
        expect(res).not.toBeNull();
      }
    });

    it('disabled', async () => {
      const flagKey = 'disabledFlag';
      fetchMock.mockResponseOnce(JSON.stringify({
        code: codeToString(Code.Unavailable),
        message:"",
      }), {
        headers: {
        "Content-Type":"application/json"
        },
        status: 400,
      })
      const res = await client
        .getStringDetails(flagKey, "")
        .catch((err) => {
          expect(err).toBeUndefined();
        });
      if (res) {
        expect(res.reason).toEqual(StandardResolutionReasons.ERROR);
        expect(res.errorCode).toEqual(ERROR_DISABLED);
      } else {
        expect(res).not.toBeNull();
      }
    });

    it('parse error', async () => {
      const flagKey = 'parseFailure';
      fetchMock.mockResponseOnce(JSON.stringify({
        code: codeToString(Code.DataLoss),
        message:"",
      }), {
        headers: {
        "Content-Type":"application/json"
        },
        status: 400,
      })
      const res = await client
        .getStringDetails(flagKey, "")
        .catch((err) => {
          expect(err).toBeUndefined();
        });
      if (res) {
        expect(res.reason).toEqual(StandardResolutionReasons.ERROR);
        expect(res.errorCode).toEqual(ERROR_PARSE_ERROR);
      } else {
        expect(res).not.toBeNull();
      }
    });
  });
})

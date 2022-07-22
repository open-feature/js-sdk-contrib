import { FlagdProvider } from './flagd-provider';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { OpenFeature, Client, ErrorCode } from '@openfeature/nodejs-sdk';


describe('FlagdProvider', () => {
  const host = "localhost"
  const port = 8080
  it('should be and instance of FlagdProvider', () => {
    expect(new FlagdProvider()).toBeInstanceOf(FlagdProvider);
  });

  describe('http service tests', () => {
    const axiosMock = new MockAdapter(axios);
    let client: Client

    beforeEach(() => {
      OpenFeature.setProvider(new FlagdProvider());
      client = OpenFeature.getClient("test")
    });

    afterEach(() => {
      axiosMock.reset();
    });

    describe('happy path tests', () => {
      it('get boolean happy path', async () => {
        const flagKey = "boolFlag"
        const path = `${host}:${port}/flags/${flagKey}/resolve/boolean`
        axiosMock.onPost(path).reply(200, {
          variant: "success",
          value: true,
          reason: "STATIC"
        })
        const res = await client.getBooleanValue(flagKey, false).catch(err => {
          expect(err).toBeUndefined()
        })
        expect(res).toEqual(true)
      });

      it('get string happy path', async () => {
        const flagKey = "stringFlag"
        const path = `${host}:${port}/flags/${flagKey}/resolve/string`
        axiosMock.onPost(path).reply(200, {
          variant: "success",
          value: "value",
          reason: "STATIC"
        })
        const res = await client.getStringValue(flagKey, "not value").catch(err => {
          expect(err).toBeUndefined()
        })
        expect(res).toEqual("value")
      });

      it('get number happy path', async () => {
        const flagKey = "numberFlag"
        const path = `${host}:${port}/flags/${flagKey}/resolve/number`
        axiosMock.onPost(path).reply(200, {
          variant: "success",
          value: 2,
          reason: "STATIC"
        })
        const res = await client.getNumberValue(flagKey, 20).catch(err => {
          expect(err).toBeUndefined()
        })
        expect(res).toEqual(2)
      });

      it('get object happy path', async () => {
        const flagKey = "objectFlag"
        const path = `${host}:${port}/flags/${flagKey}/resolve/object`
        interface foodbars {
          food: string
        }
        axiosMock.onPost(path).reply(200, {
          variant: "success",
          value: {
            "food":"bars"
          },
          reason: "STATIC"
        })
        const res = await client.getObjectValue<foodbars>(flagKey, {
          "food":"barts"
        }).catch(err => {
          expect(err).toBeUndefined()
        })
        expect(res).toEqual({
          "food":"bars"
        })
      });
    })

    describe('common errors', () => {

      it('flag not found', async () => {
        const flagKey = "notBoolFlag"
        const path = `${host}:${port}/flags/${flagKey}/resolve/boolean`
        axiosMock.onPost(path).reply(404, {
          reason: "ERROR"
        })
        const res = await client.getBooleanDetails(flagKey, false).catch(err => {
          expect(err).toBeUndefined()
        })
        if (res) {
          expect(res.reason).toEqual("ERROR")
          expect(res.errorCode).toEqual(ErrorCode.FLAG_NOT_FOUND)
        } else {
          expect(res).not.toBeNull()
        }
      })

      it('type mismatch', async () => {
        const flagKey = "stringFlag"
        const path = `${host}:${port}/flags/${flagKey}/resolve/boolean`
        axiosMock.onPost(path).reply(400, {
          reason: "ERROR"
        })
        const res = await client.getBooleanDetails(flagKey, false).catch(err => {
          expect(err).toBeUndefined()
        })
        if (res) {
          expect(res.reason).toEqual("ERROR")
          expect(res.errorCode).toEqual(ErrorCode.TYPE_MISMATCH)
        } else {
          expect(res).not.toBeNull()
        }
      })

      it('default error', async () => {
        const flagKey = "stringFlag"
        const path = `${host}:${port}/flags/${flagKey}/resolve/boolean`
        axiosMock.onPost(path).reply(500)
        const res = await client.getBooleanDetails(flagKey, false).catch(err => {
          expect(err).toBeUndefined()
        })
        if (res) {
          expect(res.reason).toEqual("ERROR")
          expect(res.errorCode).toEqual(ErrorCode.GENERAL)
        } else {
          expect(res).not.toBeNull()
        }
      })

    })
  })

});

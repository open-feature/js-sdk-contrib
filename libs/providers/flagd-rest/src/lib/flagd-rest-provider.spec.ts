import { FlagdRESTProvider } from './flagd-rest-provider';
import * as nock from 'nock';

nock.disableNetConnect();

describe('FlagdRESTProvider', () => {
  const flagdRESTProvider = new FlagdRESTProvider();

  describe('resolveBooleanEvaluation', () => {
    it('should return the value from flagd', async () => {
      nock('http://localhost:8080')
        .post('/flags/myBoolTest/resolve/boolean')
        .query({ 'default-value': false })
        .reply(200, { value: true });

      const output = await flagdRESTProvider.resolveBooleanEvaluation(
        'myBoolTest',
        false,
        {}
      );

      expect(output).toStrictEqual({ value: true });
    });
  });

  it('should handle a 404', async () => {
    nock('http://localhost:8080')
      .post('/flags/hi/hi/resolve/boolean')
      .query({ 'default-value': false })
      .reply(404, { value: true, errorCode: 'FLAG_NOT_FOUND', reason: 'ERROR' });

    const output = await flagdRESTProvider.resolveBooleanEvaluation(
      'myBoolTest',
      false,
      {}
    );

    expect(output).toStrictEqual({ value: true });
  });

  
  it('should handle a network error', async () => {
    nock('http://localhost:8080')
      .post('/flags/myBoolTest/resolve/boolean')
      .query({ 'default-value': false })
      .reply(500, {  })

    try {
      await flagdRESTProvider.resolveBooleanEvaluation(
        'myBoolTest',
        false,
        {}
      );
    }

    expect(output).toStrictEqual({ value: true });
  });
});

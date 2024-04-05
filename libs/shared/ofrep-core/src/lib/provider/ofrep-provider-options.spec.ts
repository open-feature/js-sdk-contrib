import { toRequestOptions } from './ofrep-provider-options';

describe('toRequestOptions should', () => {
  it('add simple header to the request options', () => {
    const requestOptions = toRequestOptions({ baseUrl: '', headers: [['header1', 'value1']] });
    expect(requestOptions).toEqual({ headers: [['header1', 'value1']] });
  });

  it('add multiple simple headers to the request options', () => {
    const requestOptions = toRequestOptions({
      baseUrl: '',
      headers: [
        ['header1', 'value1'],
        ['header2', 'value2'],
      ],
    });

    expect(requestOptions).toEqual({
      headers: [
        ['header1', 'value1'],
        ['header2', 'value2'],
      ],
    });
  });

  it('add headers from headerFactory to the request options', () => {
    const requestOptions = toRequestOptions({ baseUrl: '', headersFactory: () => [['header1', 'value1']] });
    expect(requestOptions).toEqual({ headers: [['header1', 'value1']] });
  });

  it('add headers from headerFactory to the request options', () => {
    const requestOptions = toRequestOptions({ baseUrl: '', headersFactory: () => ({ header1: 'value1' }) });
    expect(requestOptions).toEqual({ headers: [['header1', 'value1']] });
  });

  it('add simple headers and headerFactory headers to the request options', () => {
    const requestOptions = toRequestOptions({
      baseUrl: '',
      headers: { header1: 'value1', header2: 'value2' },
      headersFactory: () => [
        ['header3', 'value3'],
        ['header4', 'value4'],
      ],
    });
    expect(requestOptions).toEqual({
      headers: [
        ['header1', 'value1'],
        ['header2', 'value2'],
        ['header3', 'value3'],
        ['header4', 'value4'],
      ],
    });
  });
});

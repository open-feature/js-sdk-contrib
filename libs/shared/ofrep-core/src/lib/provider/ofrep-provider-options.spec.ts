import { buildHeaders } from './ofrep-provider-options';

describe('buildHeaders should', () => {
  it('add content type header', async () => {
    const headers = await buildHeaders({ baseUrl: '' });
    expect(headers.get('Content-Type')).toEqual('application/json; charset=utf-8');
  });

  it('add simple header to the request options', async () => {
    const headers = await buildHeaders({ baseUrl: '', headers: [['header1', 'value1']] });
    expect(headers.get('header1')).toEqual('value1');
  });

  it('add multiple simple headers to the request options', async () => {
    const headers = await buildHeaders({
      baseUrl: '',
      headers: [
        ['header1', 'value1'],
        ['header2', 'value2'],
      ],
    });

    expect(headers.get('header1')).toEqual('value1');
    expect(headers.get('header2')).toEqual('value2');
  });

  it('add headers from headerFactory to the request options', async () => {
    const headers = await buildHeaders({ baseUrl: '', headersFactory: () => Promise.resolve([['header1', 'value1']]) });
    expect(headers.get('header1')).toEqual('value1');
  });

  it('add headers from headerFactory to the request options', async () => {
    const headers = await buildHeaders({
      baseUrl: '',
      headersFactory: () => Promise.resolve([['header1', 'value1']]),
    });
    expect(headers.get('header1')).toEqual('value1');
  });

  it('add simple headers and headerFactory headers to the request options', async () => {
    const headers = await buildHeaders({
      baseUrl: '',
      headers: [
        ['header1', 'value1'],
        ['header2', 'value2'],
      ],
      headersFactory: () =>
        Promise.resolve([
          ['header3', 'value3'],
          ['header4', 'value4'],
        ]),
    });

    expect(headers.get('header1')).toEqual('value1');
    expect(headers.get('header2')).toEqual('value2');
    expect(headers.get('header3')).toEqual('value3');
    expect(headers.get('header4')).toEqual('value4');
  });
});

describe('buildHeaders should', () => {
  it('add simple header to the request options', async () => {
    const headers = await buildHeaders({ baseUrl: '', headers: [['header1', 'value1']] });
    expect(headers.get('header1')).toEqual('value1');
  });
});

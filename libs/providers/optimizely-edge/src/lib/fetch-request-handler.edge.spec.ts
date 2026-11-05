import { createFetchRequestHandler } from './fetch-request-handler';

describe('createFetchRequestHandler in an edge runtime', () => {
  it('translates Fetch responses to the Universal SDK response shape', async () => {
    const fetch = jest.fn().mockResolvedValue(
      new Response('{"ok":true}', {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    ) as jest.MockedFunction<typeof globalThis.fetch>;
    const handler = createFetchRequestHandler({ fetch });

    const request = handler.makeRequest('https://example.test/datafile', { authorization: 'Bearer test' }, 'GET');
    await expect(request.responsePromise).resolves.toEqual({
      statusCode: 201,
      body: '{"ok":true}',
      headers: { 'content-type': 'application/json' },
    });
    expect(fetch).toHaveBeenCalledWith('https://example.test/datafile', {
      method: 'GET',
      headers: { authorization: 'Bearer test' },
      signal: expect.any(AbortSignal),
    });
  });

  it('aborts an in-flight Fetch request', async () => {
    let signal: AbortSignal | undefined;
    const fetch = jest.fn().mockImplementation((_url: RequestInfo | URL, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    }) as jest.MockedFunction<typeof globalThis.fetch>;
    const handler = createFetchRequestHandler({ fetch });
    const request = handler.makeRequest('https://example.test/datafile', {}, 'GET');

    request.abort();

    expect(signal?.aborted).toBe(true);
    await expect(request.responsePromise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('hands background work to an edge scheduler', async () => {
    const scheduled: Promise<unknown>[] = [];
    const fetch = jest.fn().mockResolvedValue(new Response('ok')) as jest.MockedFunction<typeof globalThis.fetch>;
    const handler = createFetchRequestHandler({ fetch, schedule: (task) => scheduled.push(task) });

    const request = handler.makeRequest('https://example.test/event', {}, 'POST', '{"event":"test"}');
    await request.responsePromise;

    expect(scheduled).toHaveLength(1);
    await expect(scheduled[0]).resolves.toMatchObject({
      statusCode: 200,
      body: 'ok',
    });
  });

  it('preserves request failures without rejecting scheduled background work', async () => {
    const failure = new TypeError('network unavailable');
    const scheduled: Promise<unknown>[] = [];
    const fetch = jest.fn().mockRejectedValue(failure) as jest.MockedFunction<typeof globalThis.fetch>;
    const handler = createFetchRequestHandler({ fetch, schedule: (task) => scheduled.push(task) });

    const request = handler.makeRequest('https://example.test/event', {}, 'POST');

    await expect(request.responsePromise).rejects.toBe(failure);
    await expect(scheduled[0]).resolves.toBeUndefined();
  });
});

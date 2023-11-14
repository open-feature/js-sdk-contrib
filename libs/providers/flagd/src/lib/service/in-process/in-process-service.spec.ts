import { DataFetch } from './data-fetch';
import { InProcessService } from './in-process-service';

describe('In-process-service', () => {
  const dataFetcher: DataFetch = {
    connect: jest.fn((dataFillCallback: (flags: string) => void) => {
      dataFillCallback(
        '{"flags":{"booleanFlag":{"state":"ENABLED","variants":{"on":true,"off":false},"defaultVariant":"on"},"intFlag":{"state":"ENABLED","variants":{"first":1,"second":2},"defaultVariant":"first"}}}',
      );
    }),
    disconnect: jest.fn(),
  } as unknown as DataFetch;

  it('should sync and allow to resolve flags', async () => {
    // given
    const service = new InProcessService({ host: '', port: 0, tls: false }, dataFetcher);

    // when
    await service.connect(jest.fn, jest.fn, jest.fn);

    // then
    const resolveBoolean = await service.resolveBoolean('booleanFlag', false, {}, console);

    expect(resolveBoolean.value).toBeTruthy();
    expect(resolveBoolean.variant).toBe('on');
    expect(resolveBoolean.reason).toBe('STATIC');
  });
});
